const puppeteer = require("puppeteer");
const fetch = require("node-fetch");

// ※ 以下の URL は、実際に「ウェブアプリとしてデプロイ」した GAS の exec URL に置き換えてください
const scriptURL = "https://script.google.com/macros/s/AKfycbxFzbm0e1JTJvKSsoxW-0tFmsLj4mkSvl1J3V2U7nc9czNzg40R_ZaZ-GiwTYFTDfGY/exec";           // doPost 用（データ書き込み）
const googleSheetURL = "https://script.google.com/macros/s/AKfycbwUSjK2rn2P1HrOBxggfIhbofs9xCdr1-jrv0loQD0FYXVj_2NICPk27y0ZFS7aDPKx/exec";        // doGet 用（Seller URL取得＆重複削除）

// 対象シート例（シート名：B11～B20）
const sheets = ["B11", "B12", "B13", "B14", "B15", "B16", "B17", "B18", "B19", "B20"];

(async () => {
  console.log(`Processing ${sheets.length} sheets...`);

  for (const sheetName of sheets) {
    try {
      console.log(`Processing sheet: ${sheetName}`);
      
      // (1) Seller URL の取得（シートの D2 セルから取得）
      const sellerURL = await fetchSellerURL(sheetName);
      if (!sellerURL) {
        console.log(`Seller URL for ${sheetName} not retrieved. Skipping.`);
        continue;
      }
      console.log(`Seller URL for ${sheetName}: ${sellerURL}`);
      
      // (2) Puppeteer を用いて eBay のデータを 3 ページ分取得
      const items = await scrapeEbayData(sellerURL);
      console.log(`Scraped ${items.length} items for ${sheetName}.`);
      
      // (3) 取得データを GAS 側へ POST（7列分の配列で送信）
      console.log(`Posting data to sheet ${sheetName}...`);
      const response = await fetch(scriptURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: sheetName,
          items: items.map(item => [
            item.startDate, // A列: startDate（すでに "MM/dd HH:mm" 形式）
            item.title,     // B列: タイトル
            item.price,     // C列: 価格
            "",             // D列: (GAS側で出力日時がセットされます)
            "",             // E列: 空欄
            "",             // F列: 空欄
            item.url        // G列: URL
          ]),
        }),
      });
      const postResult = await response.text();
      console.log(`Sheet ${sheetName} updated: ${postResult}`);
      
      // (4) 重複削除＋ソート・新規追加件数算出を実行（GET パラメータ action=removeDuplicates を付与）
      console.log(`Triggering deduplication for sheet ${sheetName}...`);
      const dupResponse = await fetch(`${googleSheetURL}?sheetName=${sheetName}&action=removeDuplicates`);
      const dupResult = await dupResponse.text();
      console.log(`Deduplication result for sheet ${sheetName}: ${dupResult}`);
      
    } catch (err) {
      console.error(`Error processing sheet ${sheetName}: ${err.message}`);
    }
  }
  
  console.log("All sheets processed.");
})();

// Seller URL を取得する関数（GAS 側の doGet を呼び出し）
async function fetchSellerURL(sheetName) {
  try {
    const url = `${googleSheetURL}?sheetName=${sheetName}`;
    const response = await fetch(url);
    const text = await response.text();
    console.log(`Seller URL response for ${sheetName}: ${text}`);
    if (text.includes("Error") || !text.startsWith("http")) {
      console.error(`Error retrieving seller URL for ${sheetName}: ${text}`);
      return null;
    }
    return text.trim();
  } catch (err) {
    console.error(`Error in fetchSellerURL for ${sheetName}: ${err.message}`);
    return null;
  }
}

// Puppeteer を用いて eBay のページからデータをスクレイピングする関数
// 各アイテムの startDate を "MM/dd HH:mm" 形式（秒なし）に整形します
async function scrapeEbayData(rawUrl) {
  const urlObj = new URL(rawUrl);
  urlObj.searchParams.set("_sop", "10"); // Newly Listed
  
  const allResults = [];
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // 1～3 ページ分ループ
  for (let pageIndex = 1; pageIndex <= 3; pageIndex++) {
    urlObj.searchParams.set("_pgn", pageIndex);
    const finalUrl = urlObj.toString();
    console.log(`Scraping URL: ${finalUrl}`);
    await page.goto(finalUrl, { waitUntil: "domcontentloaded" });
    
    const itemsOnPage = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll(".s-item");
      rows.forEach(row => {
        const titleElement = row.querySelector(".s-item__title");
        const priceElement = row.querySelector(".s-item__price");
        const urlElement = row.querySelector(".s-item__link");
        const infoElement = row.querySelector(".s-item__info");
        if (!titleElement || !urlElement) return;
        const itemURL = urlElement.href;
        const title = titleElement.innerText.trim().replace(/NEW LISTING/i, "").trim();
        const price = priceElement ? priceElement.innerText.trim() : "N/A";
        let formattedDate = "N/A";
        if (infoElement) {
          const rawDate = infoElement.innerText;
          const match = rawDate.match(/(\w+)-(\d+)\s(\d+):(\d+)/);
          if (match) {
            const monthMap = {
              Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
              Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"
            };
            const month = monthMap[match[1]];
            const day = match[2].padStart(2, "0");
            const hour = match[3].padStart(2, "0");
            const min = match[4].padStart(2, "0");
            // "MM/dd HH:mm" 形式（秒は除外）
            formattedDate = `${month}/${day} ${hour}:${min}`;
          }
        }
        results.push({
          startDate: formattedDate,
          title: title,
          price: price,
          url: itemURL
        });
      });
      return results;
    });
    
    allResults.push(...itemsOnPage);
  }
  
  await browser.close();
  return allResults;
}
