
// import * as moment from 'moment';

const consoleLog = (logInfo: any) => {
    doLog('LOG', logInfo);
};

const consoleError = (logInfo: any) => {
    doLog('ERROR', logInfo);
};

const logs: string[] = [];

function doLog(level: string, data: any) {
    if ('string' !== typeof data) {
        data = `[${level}] ${JSON.stringify(data)}`;
    } else {
        data = `[${level}] ${data}`;
    }
    logs.push(data);
    // const error = new Error();
    // logs.push(error.stack as string);
    if (logs.length >= 200) {
        logs.shift();
    }
    $('#app').html(logs.join('</br>')).css('font-size', '10px');
    $('#body').scrollTop($('body').prop('scrollHeight'));
};

window.onerror = (error) => {
    consoleError(error);
}

window.addEventListener('unhandledrejection', (error) => {
    consoleError(error);
})

import { Response } from 'request';
import { TListItem, THttpResponse, TCanStealCoin, TStealResult, TMineCoin, THistoryStealList } from 'main-types';

const Authorization: string = window.btoa(localStorage.getItem("userId") + ":" + localStorage.getItem("token"))
const noChange: string = 'false';
const UserId: string = localStorage.getItem("userId") as string;

const sign: (url: string) => Promise<{sign: string, nonce: number, timestamp: number}> = async function sign(url: string): Promise<{sign: string, nonce: number, timestamp: number}> {
    return new Promise((resolve) => {
        let token = window.localStorage.getItem("token");
        const timestamp: number = Date.now();
        (window as any).cordova.exec((e: any) => {
            e.timestamp = timestamp;
            resolve(e);
        }, () => {
        }, 'Auth', 'sign', [url, token, timestamp]);
    });
}

const headers = {
    Authorization: Authorization,
    Host: 'walletgateway.gxb.io',
    Origin: 'https://walletgateway.gxb.io',
    "Accept-Encoding": "br, gzip, deflate",
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 11_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E302 (5880463872)",
    "Referer": "/",
    "Accept-Language": "zh-CN",
}

const getPromise: (uri: string, data?: any, options?: Headers) => Promise<Response> = async function(uri: string, data?: any, options?: Headers) {
    return await requestFetch(uri, 'GET', data, options);
}

const postPromise: (uri: string, data?: any, options?: Headers) => Promise<Response> = async function(uri: string, data?: any, options?: Headers) {
    return await requestFetch(uri, 'POST', data, options);
}

async function requestFetch(url: string, method: string, data?:{[name: string]: any}, options?: Headers): Promise<Response> {
    let signUrl = url;
    if (void 0 === data) {
        data = {};
    } else {
        let signQuery = '';
        for (let key in data) {
            const value = data[key];
            signQuery += `${key}=${value}&`;
        }
        signQuery = signQuery.substr(0, signQuery.length - 1);
        signUrl = `${url}${signQuery}`;
    }
    const urlSign = await sign(signUrl);

    data.sign = urlSign.sign;
    data.nonce = urlSign.nonce;
    data.timestamp = urlSign.timestamp;
    let query: string = '';
    for (let key in data) {
        const value = data[key];
        query += `${key}=${value}&`;
    }
    const requestUrl = `https://walletgateway.gxb.io${url}?${query}`;
    const res = await fetch(requestUrl, {
        method: method,
        headers: headers,
    });
    const body = await res.text();
    return {
        body
    } as Response;
}

const DEFAULT_DISTANCE_TIME = 5 * 60 * 1000;
const MIN_DISTANCE_TIME = 1.5 * 60 * 1000;
// unit: ms.
const SERVER_PING = 9;
let DISTANCE_TIME = DEFAULT_DISTANCE_TIME;

let mineCoins: Array<TMineCoin> = [];
let canStealCoins: Array<TCanStealCoin> = [];

function sleep(time: number): Promise<void> {

    return new Promise<void>((resolve, reject) => {
        setTimeout(resolve, time);
    });

}

function getDisplayTime(): string {
    return '';
}

async function loadCordova() {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'static/cordova/cordova.ios.js';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

async function loadMoment() {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'static/moment.js';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

async function loadVConsole() {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'static/vconsole.js';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

async function start(): Promise<void> {
    await loadCordova();
    await loadMoment();
    await loadVConsole();
    landCoins();
    reapCoins();
}

async function landCoins(): Promise<void> {
    while ( true ) {
        mineCoins = [];
        canStealCoins = [];

        try {
            mineCoins = await landMineCoins();
            let data: Array<TListItem> = await landStealListCoins();
            const historyStealList: Array<TListItem> = await landAllHistorySteamMan();
            data = data.concat( historyStealList );
            const oftenStealList: Array<TListItem> = await landOftenListCoins();
            data = data.concat( oftenStealList );

            for (let i = 0; i < data.length; i++) {
                const item: TListItem = data[ i ];
                const stealCoins: Array<TCanStealCoin> = await listCanStealCoins( item.userId );
                canStealCoins = canStealCoins.concat( stealCoins );
            }
        } catch ( e ) {
            consoleLog( e );
        }

        await sleep( DISTANCE_TIME );
    }
}

async function landMineCoins(): Promise<Array<TMineCoin>> {
    consoleLog(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] getting myself coins...`);
    const url: string = `/miner/${UserId}/mine/list/v2`;
    const res: Response = await getPromise(url);
    const resData: THttpResponse<{ mines: Array<TMineCoin> }> = JSON.parse(res.body);
    const mines: Array<TMineCoin> = resData.data.mines;

    consoleLog(resData);
    if (null === resData.message) {
        return mines;
    } else {
        throw new Error(resData.message);
    }
}

let needChange: boolean = false;
async function landStealListCoins(): Promise<Array<TListItem>> {

    let changeFlag: string = 'false';
    if ( true === needChange ) {
        consoleLog(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] change list`);
        changeFlag = 'true';
        needChange = false;
    }

    const url: string = `/miner/steal/user/list/v2`;
    const res: Response = await getPromise(url, {
        change: changeFlag,
        hasLocation: 'true'
    });
    const resData: THttpResponse<{ leftAmount: number, list: Array<TListItem> }> = JSON.parse(res.body);
    
    let data: Array<TListItem> = [];
    
    if (null === resData.message) {
        const { leftAmount, list } = resData.data;
        needChange = calculateNeedChange( leftAmount );
        // thresholdTimes = calculateThresholdTimes(leftAmount);
        return list;
    } else {
        throw new Error(resData.message);
    }
}

/**
 * 获取所有的历史访问的数据
 */
async function landAllHistorySteamMan(): Promise<Array<TListItem>> {
    consoleLog(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] getting history steal coins...`);
    let data: Array<THistoryStealList> = [];

    let page: number = 0;
    while (true) {
        const result: Array<THistoryStealList> = await landHistoryStealList(page++);
        if (0 === result.length) {
            break;
        }
        data = data.concat(result);
    }
    const resultList: Array<TListItem> = [];
    for (let i = 0; i < data.length; i++) {
        const item: THistoryStealList = data[i];
        const listItem: TListItem = {
            userId: item.stealUserId,
            nickName: item.stealNick,
            history: true
        } as TListItem;
        resultList.push(listItem);
    }
    return resultList;
}

/**
 * 获取历史访问的人
 */
async function landHistoryStealList(pageNo: number, size: number = 30): Promise<Array<THistoryStealList>> {
    const url: string = `/miner/steal/record/list`;
    const res: Response = await getPromise(url, {
        pageNo: pageNo,
        pageSize: size,
    });
    const resData: THttpResponse<Array<THistoryStealList>> = JSON.parse(res.body);
    return resData.data;
}

let emptyTimes: number = 0;
function calculateNeedChange( leftAmount: number ): boolean {

    // 标注不改变。
    if ( 'true' === noChange ) {
        return false;
    }

    const now: moment.Moment = moment();
    const nowHour: number = now.hours();
    if ( 0 < nowHour && 6 > nowHour ) {
        if ( DISTANCE_TIME !== DEFAULT_DISTANCE_TIME ) {
            consoleLog(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] adjust distance time to default value: [${ DEFAULT_DISTANCE_TIME }]` );
            DISTANCE_TIME = DEFAULT_DISTANCE_TIME;
        }
        return false;
    }

    const leftChangeTimes: number = Math.floor( leftAmount / 8 );
    const todayLastTime: moment.Moment = moment();
    todayLastTime.hours( 23 );
    todayLastTime.minutes( 59 );
    todayLastTime.seconds( 59 );
    const leftMilSeconds: number = +todayLastTime - +now + emptyTimes * DISTANCE_TIME;
    const totalRoundTimes: number = Math.floor( leftMilSeconds / DISTANCE_TIME );
    const distanceEmptyTime: number = Math.floor( totalRoundTimes / leftChangeTimes );

    // 按照当前时间已经无法将今天的都刷新完，调整distance_time.
    if ( 1 >= distanceEmptyTime ) {
        DISTANCE_TIME = Math.floor( ( +todayLastTime - +now ) / leftChangeTimes );
        if ( DISTANCE_TIME < MIN_DISTANCE_TIME ) {
            DISTANCE_TIME = MIN_DISTANCE_TIME;
        } else if ( DISTANCE_TIME > DEFAULT_DISTANCE_TIME ) {
            DISTANCE_TIME = DEFAULT_DISTANCE_TIME;
        }
        consoleLog(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] not enough time! adjust distance time to: [${ DISTANCE_TIME }]` );
        return true;
    }

    if ( emptyTimes >= distanceEmptyTime ) {
        emptyTimes = 0;
        return true;
    } else {
        emptyTimes ++;
        return false;
    }
}

async function landOftenListCoins(): Promise<Array<TListItem>> {
    consoleLog(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] getting offten steal coins...`);
    const url: string = `/miner/steal/often/list`;
    const res: Response = await getPromise(url);
    const resData: THttpResponse<Array<TListItem>> = JSON.parse(res.body);
    if (null === resData.message) {
        // canStealCoins = canStealCoins.concat( resData.data );
        return resData.data;
    } else {
        throw new Error(resData.message);
    }
}

async function listCanStealCoins(userId: string): Promise<Array<TCanStealCoin>> {
    
    // consolelog(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] getting can steal coins...`);
    const url: string = `/miner/steal/${userId}/mine/list`;
    const res: Response = await getPromise(url);
    const resData: THttpResponse<Array<TCanStealCoin>> = JSON.parse(res.body);
    
    let data: Array<TCanStealCoin> = [];
    
    if (null === resData.message) {
        data = resData.data;
    } else {
        throw new Error(resData.message);
    }
    
    let validCoins: Array<TCanStealCoin> = [];

    const now: number = Date.now();
    for( let i = 0; i < data.length; i ++ ) {
        const coin: TCanStealCoin = data[ i ];
        // invalid coin
        if ( now >= coin.validDate && true !== coin.canSteal ) {
            continue;
        }
        coin.userId = userId;
        validCoins.push( coin );
    }
    
    return validCoins;
}

async function reapCoins(): Promise<void> {
    while( true ) {
        await sleep( 10 * 1000 );
        try {
            await reapMineCoins();
            await reapStealCoins();
        } catch ( e ) {
            consoleLog( e );
        }
    }
}

async function reapMineCoins(): Promise<void> {

    const now: number = Date.now();
    const willMineCoins: Array<TMineCoin> = [];

    for (let i = 0; i < mineCoins.length; i ++ ) {
        const mineCoin: TMineCoin = mineCoins[ i ];
        if ((now - SERVER_PING) >= mineCoin.validTime) {
            consoleLog(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] getting mined coin: [${mineCoin.symbol}], amount: [${mineCoin.amount}]`);
            const url: string = `/miner/${UserId}/mine/${mineCoin.id}/v2`;
            const res: Response = await getPromise(url);
            const resData: THttpResponse<{ drawAmount: number }> = JSON.parse(res.body);

            if ( null === resData.message ) {
                await store('mine', mineCoin.symbol, resData.data.drawAmount);
            } else {
                willMineCoins.push( mineCoin );
                throw new Error( resData.message );
            }
        } else {
            willMineCoins.push( mineCoin );
        }
    }
    mineCoins = willMineCoins;
}

async function reapStealCoins(): Promise<void> {
    const now: number = Date.now();
    
    const willStealCoins: Array<TCanStealCoin> = [];

    for ( let i = 0; i < canStealCoins.length; i ++ ) {
        const canStealCoin: TCanStealCoin = canStealCoins[ i ];
        if ( true === canStealCoin.canSteal && ( now - SERVER_PING ) >= canStealCoin.validDate ) {
            consoleLog(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] stealing coin from : [${canStealCoin.userId}], now: [${ now }], valid: [${ canStealCoin.validDate }], cansteal: [${ canStealCoin.canSteal }] ...`);
            const url: string = `/miner/steal/${ canStealCoin.userId }/mine/${ canStealCoin.mineId }`;
            let res: Response = {} as Response;
            try {
                res = await postPromise(url);
            } catch(e) {
                consoleError(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] stealing coin from : [${canStealCoin.userId}] with request error: [${e.message}]`);
                continue;
            }
            const resData: THttpResponse<TStealResult> = JSON.parse( res.body );

            if ( null === resData.message ) {
                await store( 'steal', canStealCoin.symbol, resData.data.stealAmount );
            } else {
                // willStealCoins.push( canStealCoin );
                consoleError(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] stealing coin from : [${canStealCoin.userId}] with error: [${resData.message}]`);
                continue;
                // throw new Error( resData.message );
            }
        } else {
            willStealCoins.push( canStealCoin );
        }
    }
    canStealCoins = willStealCoins;
}

async function store(type: 'steal' | 'mine', symbol: string, amount: number): Promise<void> {
    consoleLog(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] store new coin: [${symbol}], amount: [ ${amount} ]`);
}

async function liveCheck() {
    while( true ) {
        consoleLog( `[${moment().format('YYYY-MM-DD HH:mm:ss')}] live check` );
        await sleep( 1 * 60 * 1000 );
    }
}
start();
liveCheck();
