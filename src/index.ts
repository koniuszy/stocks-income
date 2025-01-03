import csvParser from "csv-parser";
import { createReadStream } from "node:fs";
import path from "node:path";

const loadCsv = async () =>
  new Promise((resolve, reject) => {
    createReadStream(path.resolve(__dirname, "./data/degiro-2024.csv"))
      .pipe(
        csvParser({
          separator: ";", // Specify semicolon as the delimiter
          mapHeaders: ({ header }) => header.trim(), // Trim whitespace from headers
          mapValues: ({ value }) => value.trim(),
        })
      )
      .on("data", (data) => resolve(data))
      .on("error", (error) => reject(error));
  });

const run = async () => {
  const csv = await loadCsv();
  console.log(csv);
};

run();
