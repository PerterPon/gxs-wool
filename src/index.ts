
import * as request from 'request';
import * as fs from 'fs-extra';
import * as moment from 'moment';
import * as util from 'util';
import * as path from 'path';
import "colors";

import { CoreOptions, Response } from 'request';
import { TListItem, THttpResponse, TCanStealCoin, TStealResult, TMineCoin } from 'main-types';

const Authorization: string = process.argv[ 2 ];
const UserId: string = process.argv[ 3 ];

const getPromise: (uri: string, options: CoreOptions) => Promise<Response> = util.promisify<string, CoreOptions, Response>(request.get);
const postPromise: (uri: string, options: CoreOptions) => Promise<Response> = util.promisify<string, CoreOptions, Response>(request.post);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const headers: CoreOptions = {
    headers: {
        Authorization: Authorization,
        Host: 'walletgateway.gxb.io',
        Origin: 'https://walletgateway.gxb.io',
        "Accept-Encoding": "br, gzip, deflate",
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 11_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E302 (5880463872)",
        "Referer": "https://walletgateway.gxb.io/",
        "Accept-Language": "zh-CN"
    }
};

const DEFAULT_DISTANCE_TIME = 5 * 60 * 1000;
const MIN_DISTANCE_TIME = 1.5 * 60 * 1000;
let DISTANCE_TIME = DEFAULT_DISTANCE_TIME;

const storeFilePath: string = path.join( __dirname, '../../count.json' );

let mineCoins: Array<TMineCoin> = [];
let canStealCoins: Array<TCanStealCoin> = [];

function sleep(time: number): Promise<void> {

    return new Promise<void>((resolve, reject) => {
        setTimeout(resolve, time);
    });

}

function getDisplayTime(): string {
    return moment().format( 'YYYY-MM-DD' );
}

async function start(): Promise<void> {
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
            const oftenStealList: Array<TListItem> = await landOftenListCoins();
            data = data.concat( oftenStealList );

            for (let i = 0; i < data.length; i++) {
                const item: TListItem = data[ i ];
                const stealCoins: Array<TCanStealCoin> = await listCanStealCoins( item.userId );
                canStealCoins = canStealCoins.concat( stealCoins );
            }
        } catch ( e ) {
            console.log( e );
        }

        await sleep( DISTANCE_TIME );
    }
}

async function landMineCoins(): Promise<Array<TMineCoin>> {
    console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] getting myself coins...`.yellow);
    const url: string = `https://walletgateway.gxb.io/miner/${UserId}/mine/list/v2`;
    const res: Response = await getPromise(url, headers);
    const resData: THttpResponse<{ mines: Array<TMineCoin> }> = JSON.parse(res.body);
    const mines: Array<TMineCoin> = resData.data.mines;

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
        console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] change list`.yellow);
        changeFlag = 'true';
        needChange = false;
    }

    const url: string = `https://walletgateway.gxb.io/miner/steal/user/list/v2?change=${changeFlag}&hasLocation=true`;
    
    const res: Response = await getPromise(url, headers);
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

let emptyTimes: number = 0;
function calculateNeedChange( leftAmount: number ): boolean {

    const now: moment.Moment = moment();
    const nowHour: number = now.hours();
    if ( 0 < nowHour && 6 > nowHour ) {
        if ( DISTANCE_TIME !== DEFAULT_DISTANCE_TIME ) {
            console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] adjust distance time to default value: [${ DEFAULT_DISTANCE_TIME }]`.gray );
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
        }
        console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] not enough time! adjust distance time to: [${ DISTANCE_TIME }]`.red );
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
    console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] getting offten steal coins...`.yellow);
    const url: string = 'https://walletgateway.gxb.io/miner/steal/often/list';
    const res: Response = await getPromise(url, headers);
    const resData: THttpResponse<Array<TListItem>> = JSON.parse(res.body);
    if (null === resData.message) {
        // canStealCoins = canStealCoins.concat( resData.data );
        return resData.data;
    } else {
        throw new Error(resData.message);
    }
}

async function listCanStealCoins(userId: string): Promise<Array<TCanStealCoin>> {
    
    // console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] getting can steal coins...`.yellow);
    const url: string = `https://walletgateway.gxb.io/miner/steal/${userId}/mine/list`;
    const res: Response = await getPromise(<any>url, <any>headers);
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
        await sleep( 1 * 1000 );
        try {
            await reapMineCoins();
            await reapStealCoins();
        } catch ( e ) {
            console.log( e );
        }
    }
}

async function reapMineCoins(): Promise<void> {

    const now: number = Date.now();

    const willMineCoins: Array<TMineCoin> = [];

    for (let i = 0; i < mineCoins.length; i ++ ) {
        const mineCoin: TMineCoin = mineCoins[ i ];
        if ( now >= mineCoin.validTime ) {
            console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] getting mined coin: [${mineCoin.symbol}], amount: [${mineCoin.amount}]`);
            const url: string = `https://walletgateway.gxb.io/miner/${UserId}/mine/${mineCoin.id}/v2`;
            const res: Response = await getPromise(url, headers);
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

    for (let i = 0; i < canStealCoins.length; i ++ ) {
        const canStealCoin: TCanStealCoin = canStealCoins[ i ];
        if ( true === canStealCoin.canSteal || now >= canStealCoin.validDate ) {
            console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] stealing coin, now: [${ now }], valid: [${ canStealCoin.validDate }], cansteal: [${ canStealCoin.canSteal }] ...`.yellow);
            const url: string = `https://walletgateway.gxb.io/miner/steal/${ canStealCoin.userId }/mine/${ canStealCoin.mineId }`;
            const res: Response = await postPromise( <any>url, <any>headers );
            const resData: THttpResponse<TStealResult> = JSON.parse( res.body );

            if (null === resData.message) {
                await store( 'steal', canStealCoin.symbol, resData.data.stealAmount );
            } else {
                willStealCoins.push(canStealCoin);
                throw new Error( resData.message );
            }
        } else {
            willStealCoins.push( canStealCoin );
        }
    }
    canStealCoins = willStealCoins;
}

async function store(type: 'steal' | 'mine', symbol: string, amount: number): Promise<void> {
    console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] store new coin: [${symbol}], amount: [ ${amount} ]`);

    const stoneFile: string = path.join(__dirname, '../../count.json');
    const file: string = fs.readFileSync(stoneFile, 'utf-8');
    try {
        const store: { steal: { [name: string]: number }, mine: { [name: string]: number } } = JSON.parse(file) || {};
        const target: { [name: string]: number } = store[type];
        const nowCount: number = target[symbol] || 0;
        target[symbol] = nowCount + amount;
        fs.writeFileSync(stoneFile, JSON.stringify(store, <any>'', 2));
    } catch (e) { console.log( e ); }

}

start();

process.on('uncaughtException', (error: Error) => {
    console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] uncaughtException\n${error.message}\n${error.stack}`.red);
});

process.on('unhandledRejection', ( reason: string ) => {
    console.log(`[${moment().format('YYYY-MM-DD HH:mm:ss')}] unhandledRejection, reason: [${ reason }]`.red);
});


async function liveCheck() {
    while( true ) {

        await sleep( 2 * 60 * 1000 );

        console.log( `[${moment().format('YYYY-MM-DD HH:mm:ss')}] live check`.gray );

    }
}
liveCheck();

