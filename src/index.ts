import csvParser from "csv-parser";
import { createReadStream } from "node:fs";
import path from "node:path";
import { getPreviousDayExchangeRate } from "./helpers";

type Transaction = {
  date: Date;
  fee: number;
  value: number;
  price: number;
  quantity: number;
  productName: string;
  year: number;
};

const loadCsv = async (): Promise<Transaction[]> => {
  const results: Transaction[] = [];
  return new Promise((resolve, reject) => {
    createReadStream(path.resolve(__dirname, "./data/degiro.csv"))
      .pipe(
        csvParser({
          separator: ",",
          mapValues: ({ value }) => value.trim(),
        })
      )
      .on("data", (r) => {
        const [day, month, year] = r.Date.split("-");
        results.push({
          date: new Date(`${year}-${month}-${day} ${r.Time}`),
          productName: r.Product,
          value: Number(r.Value),
          fee: Number(r["Transaction and/or third"]),
          quantity: Number(r.Quantity),
          year: Number(year),
          price: Math.abs(Number(r.Value) / Number(r.Quantity)),
        });
      })
      .on("error", (error) => reject(error))
      .on("end", () => resolve(results));
  });
};

const prefetchedRates = {
  "2024-09-12": 4.2986,
  "2024-09-27": 4.2761,
  "2024-09-13": 4.2883,
  "2024-09-24": 4.2668,
  "2024-09-17": 4.2748,
  "2024-09-26": 4.2665,
  "2024-09-23": 4.2785,
  "2024-10-01": 4.2846,
  "2024-10-11": 4.2926,
  "2024-10-24": 4.3396,
  "2024-10-22": 4.3159,
  "2024-11-06": 4.3662,
  "2024-10-23": 4.3344,
  "2024-11-01": 4.353,
  "2024-11-13": 4.3416,
  "2024-11-28": 4.3085,
  "2024-11-15": 4.3198,
  "2024-12-05": 4.2695,
  "2024-12-20": 4.2572,
  "2025-01-02": 4.2668,
  "2025-01-03": 4.2718,
};
const exchangeRates = new Map<string, number>(Object.entries(prefetchedRates));
const assets = new Map<string, number>();

const run = async () => {
  const transactions = await loadCsv().then((d) =>
    d.sort((a, b) => a.date.getTime() - b.date.getTime())
  );

  const unhandledSellTransactions = transactions.filter((t) => t.quantity < 0);
  const buyTransactions = transactions.filter((t) => t.quantity > 0);

  const closedTxs: {
    name: string;
    yearToPayTax: number;
    profit: number;
    fee: number;
    profitPLN: number;
    feePLN: number;
  }[] = [];

  for (const buyTx of buyTransactions) {
    const sellTxs = unhandledSellTransactions.filter(
      (t) => t.productName === buyTx.productName && t.quantity < 0
    );

    if (!sellTxs.length) {
      const existing = assets.get(buyTx.productName);
      assets.set(
        buyTx.productName,
        existing ? existing + buyTx.quantity : buyTx.quantity
      );
      continue;
    }

    if (sellTxs.reduce((acc, item) => acc + item.quantity, 0) > buyTx.quantity)
      throw Error(
        "Sold more than bought, your list of transactions is incomplete"
      );

    let fee = buyTx.fee;

    const buyTxDateKey = buyTx.date.toISOString().split("T")[0];
    if (!exchangeRates.has(buyTxDateKey)) {
      exchangeRates.set(
        buyTxDateKey,
        await getPreviousDayExchangeRate(buyTx.date)
      );
    }

    const buyDateExchangeRate = exchangeRates.get(buyTxDateKey);
    for (const sellTx of sellTxs) {
      const sellTxDateKey = sellTx.date.toISOString().split("T")[0];
      if (!exchangeRates.has(sellTxDateKey)) {
        exchangeRates.set(
          sellTxDateKey,
          await getPreviousDayExchangeRate(sellTx.date)
        );
      }
      const sellDateExchangeRate = exchangeRates.get(sellTxDateKey);

      const quantity = Math.min(Math.abs(sellTx.quantity), buyTx.quantity);

      if (!buyDateExchangeRate || !sellDateExchangeRate)
        throw Error("No exchange rate");

      closedTxs.push({
        name: buyTx.productName,
        yearToPayTax: sellTx.year,
        profit:
          Math.round((sellTx.price * quantity - buyTx.price * quantity) * 100) /
          100,
        fee: fee + sellTx.fee,
        feePLN: fee * buyDateExchangeRate + sellTx.fee * sellDateExchangeRate,
        profitPLN:
          Math.round(
            (sellTx.price * quantity * sellDateExchangeRate -
              buyTx.price * quantity * sellDateExchangeRate) *
              100
          ) / 100,
      });

      sellTx.fee = 0;
      fee = 0;
      sellTx.quantity += quantity;
      buyTx.quantity -= quantity;

      if (buyTx.quantity === 0) break;
    }
  }

  const yearsToPay = new Set(closedTxs.map((t) => t.yearToPayTax));
  for (const year of yearsToPay) {
    const yearTxs = closedTxs.filter((t) => t.yearToPayTax === year);
    const totalProfitEur =
      Math.round(yearTxs.reduce((acc, t) => acc + t.profit, 0) * 100) / 100;
    const totalFeeEur =
      Math.round(yearTxs.reduce((acc, t) => acc + t.fee, 0) * 100) / 100;
    const totalProfitPLN =
      Math.round(yearTxs.reduce((acc, t) => acc + t.profitPLN, 0) * 100) / 100;
    const totalFeePLN =
      Math.round(yearTxs.reduce((acc, t) => acc + t.feePLN, 0) * 100) / 100;

    console.log(
      `Year ${year}: 
      EUR: Profit ${totalProfitEur}
      EUR: Fees ${totalFeeEur} 
      PLN: Profit ${totalProfitPLN} 
      PLN: Fees ${totalFeePLN}
      PLN: Tax ${Math.round((totalProfitPLN - totalFeePLN) * 0.19 * 100) / 100}`
    );
  }

  console.log(`Current assets: `, assets);
};

run();
