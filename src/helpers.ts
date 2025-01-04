export const getPreviousDayExchangeRate = async (
  date: Date
): Promise<number> => {
  const [year, month, day] = date.toISOString().split("T")[0].split("-");

  const data = await fetch(
    `https://api.nbp.pl/api/exchangerates/rates/a/eur/${year}-${month}-${day}/?format=json`
  );

  if (data.status === 404) {
    return getPreviousDayExchangeRate(new Date(date.getTime() - 86400000));
  }

  const json = await data.json();
  console.log(
    "add this to prefetched exchange rates so it doesn't get fetched over and over",
    { [date.toISOString().split("T")[0]]: json.rates[0].mid }
  );
  return json.rates[0].mid;
};
