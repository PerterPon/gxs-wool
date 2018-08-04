

declare module 'main-types' {

    export type TListItem = {
        userId: string;
        nickName: string;
        distance: string;
        type: 2;
        power: number;
        canSteal: boolean;
        countDown: any;
        stealCount: number;
    };

    export type THttpResponse<T> = {
        message: string;
        data: T;
    };

    export type TCanStealCoin = {
        mineId: string;
        symbol: string;
        canSteal: boolean;
        validDate: number;
        userId: string;
        amount: number;
    };

    export type TStealResult = {
        remainAmount: number;
        stealAmount: number;
        stealPercent: number;
    };

    export type TMineCoin = {
        id: string;
        status: number;
        validTime: number;
        symbol: string;
        amount: number;
    };

}



