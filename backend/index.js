// import libraries 
require("dotenv").config(); // hides secrets

const express = require("express"); // makes writing servers easier
const cors = require("cors"); // allows frontend to talk to backend
const pool = require("./db"); // access the database connection pool from db.js
const axios = require("axios"); // a helper library for making HTTP requests (aka go to this URL and give me the JSON back)
const cron = require("node-cron");
const { emailAlert } = require("./mailer");

const PORT = process.env.PORT || 3030;

// create the server
const app = express();
app.use(cors());
app.use(express.json());

// helper
async function fetch(appid){
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=ca&l=en`;
  const steamRes = await axios.get(url);
  const entry = steamRes.data[appid];
  if (!entry || !entry.success) return null;
  return entry.data;
}

// test route for /health
app.get("/health", (req, res) => { // run once a request is sent
  res.json({ ok: true, message: "backend is running" });
});

// test route for /games 
app.get("/games", async (req, res) => { // run function once someone visits /games
  try {
    const { rows } = await pool.query( // ask (and wait) postgres for every game (appid and name)
      "SELECT appid, name FROM games ORDER BY name ASC"
    ); 
    res.json(rows);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ ok: false, error: "DB error" });
  }
});

// visits http://localhost:3030/game?appid=# and sends JSON back
app.get("/game", async (req, res) => {
  try {
    // A) get app id from the URL
    const appid = parseInt(req.query.appid, 10); // converts strings to numbers (10 for decimal)

    if(!appid){
      return res.status(400).json({ok: false, error: "Missing or invalid appid"});
    }
    // B) ask steam for details about the app id 
    const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=ca&l=en`;
    // appids -> which game
    // cc=ca -> the country (for currency)
    // l=en -> language 
    const steamRes = await axios.get(url);

    const entry = steamRes.data[appid];

    if (!entry || !entry.success){
      return res.status(404).json({ ok: false, error: "App not found on Steam"});
    }
    // C) access price and info of app
    const gameInfo = entry.data;
    console.log("STEAM GAME INFO KEYS:", Object.keys(gameInfo));
    console.log("PACKAGE GROUPS:", gameInfo.package_groups);
    const name = gameInfo.name;

    const po = gameInfo.price_overview; // either an object or undefined
    const price_cents = po ? po.final : null; // if price exists use it, if not then free/null
    const currency = po ? po.currency : null; // if currenc exists use it, if not then free/null
    const discount_percent = po ? po.discount_percent : null; // if discount exists use it, if not then free/null

    // D) saving to database, insert into game and price_history
    await pool.query( // postgres connection sent to SQL for DB and waits until DB is done
      // this is SQL code, putting row into the games table, $1->appid & $2->name, and throws error is appid seen twice 
      `INSERT INTO games (appid, name)
       VALUES ($1, $2)
       ON CONFLICT (appid) DO UPDATE SET name = EXCLUDED.name`,
      [appid, name]
    );
    
    // E) returning the data to browser (sending JSON back)
    res.json({ ok: true, appid, name, price_cents, currency, discount_percent });
  }catch (err) { // if some error were to occur, inform user 
    console.error(err);
    res.status(500).json({ ok: false, error: "Something went wrong"});
  }
});

app.get("/game/:appid/history", async (req, res) => {
  try {
    const appid = parseInt(req.params.appid, 10);
    // only display last couple price snapshots 
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 200);
    // uses limit from URL or it diffults to 20 and never return more than 200

    if(!appid){
      return res.status(400).json({ok: false, error: "Missing or invalid appid"});
    }

    const { rows } = await pool.query(
      // orders the rows of DB results from newest first to oldest last 
      `SELECT price_cents, currency, discount_percent, recorded_at
      FROM price_history
      WHERE appid = $1
      ORDER BY recorded_at DESC
      LIMIT $2`,
      [appid, limit]
    );

    res.json({ ok: true, appid, history: rows });
  }catch (err){
    console.error("DB error:", err);
    res.status(500).json({ ok: false, error: "DB error"})
  }
});

// helper function to use for /games/track (UI) and /track/run
async function syncSteam(appid) {
  // fetch from Steam
  const gameInfo = await fetch(appid);
  if (!gameInfo) return null;

  const name = gameInfo.name;
  const po = gameInfo.price_overview;

  const price_cents = po ? po.final : null;
  const currency = po ? po.currency : null;
  const discount_percent = po ? po.discount_percent : null;

  await pool.query(
    `INSERT INTO games (appid, name)
     VALUES ($1, $2)
     ON CONFLICT (appid) DO UPDATE SET name = EXCLUDED.name`,
    [appid, name]
  );

  // get the latest price of a game from database for specific appid
  const latest = await pool.query(
    `SELECT price_cents, currency, discount_percent
     FROM price_history
     WHERE appid = $1
     ORDER BY recorded_at DESC
     LIMIT 1`,
    [appid]
  );

  let snapshot_inserted = false;

  // if latest exists and its identical, skip insert 
  if (latest.rows.length === 0) {
    // first snapshot ever
    await pool.query(
      `INSERT INTO price_history (appid, price_cents, currency, discount_percent)
       VALUES ($1, $2, $3, $4)`,
      [appid, price_cents, currency, discount_percent]
    );
    snapshot_inserted = true;
  } else {  // comparing prices
    const last = latest.rows[0];
    const same =
      last.price_cents === price_cents &&
      last.currency === currency &&
      last.discount_percent === discount_percent;

    // all true at the same time
    if (!same) {
      await pool.query(
        `INSERT INTO price_history (appid, price_cents, currency, discount_percent)
         VALUES ($1, $2, $3, $4)`,
        [appid, price_cents, currency, discount_percent]
      );
      snapshot_inserted = true;
    }
  }

  // return normalized result
  return {
    appid,
    name,
    price_cents,
    currency,
    discount_percent,
    snapshot_inserted,
  };
}

// tracking cycle, udates all tracked games and sends alerts if needed
app.post("/track/run", async (req, res) => {
  try {
    const { rows: games } = await pool.query("SELECT appid, name FROM games ORDER BY appid ASC");

    let inserted = 0;
    let alerted = 0;

    for (const g of games) {
      const appid = g.appid;

      const result = await syncSteam(appid);
      if (!result) continue;

      if (result.snapshot_inserted) {
        inserted++;
      }

      // alert logic stays here (business rule layer)
      if (result.discount_percent != null && result.discount_percent > 0) {
        const { rows: alerts } = await pool.query(
          `SELECT id, email, min_discount_percent
           FROM discount_alert
           WHERE appid = $1
             AND active = TRUE
             AND min_discount_percent <= $2
             AND (latest_trigger IS NULL
               OR latest_trigger < NOW() - INTERVAL '24 hours')`,
          [appid, result.discount_percent]
        );

        for (const a of alerts) {
          await emailAlert({
            to: a.email,
            gameName: result.name,
            appid,
            discountPercent: result.discount_percent,
            priceCents: result.price_cents,
            currency: result.currency,
          });

          await pool.query(
            `UPDATE discount_alert
             SET latest_trigger = NOW()
             WHERE id = $1`,
            [a.id]
          );

          alerted++;
        }
      }
    }

    res.json({ ok: true, tracked_games: games.length, inserted, alerted,});
  } catch (err) {
    console.error("track/run error:", err);
    res.status(500).json({ ok: false, error: "Tracking run failed" });
  }
});

// UI calling - for when user wants to track games (syncs and returns result)
app.post("/games/track", async (req, res) => {
  try {
    const appid = parseInt(req.body.appid, 10);
    if (!appid) {
      return res.status(400).json({ ok: false, error: "Missing or invalid appid" });
    }

    const result = await syncSteam(appid);
    if (!result) {
      return res.status(404).json({ ok: false, error: "App not found on Steam" });
    }

    res.json({ ok: true, game: result, });
  } catch (err) {
    console.error("POST /games/track error:", err);
    res.status(500).json({ ok: false, error: "Failed to track game" });
  }
});


// tracking price updates 
cron.schedule("*/30 * * * *", async () => { // run function every 30 minutes
  try{
    console.log("[cron] running price tracker"); // checking id cron ran

    await axios.post(`http://localhost:${PORT}/track/run`);

    // final log message 
    console.log("[cron] tracking cycle complete");
  }catch(err){ // if error occurs 
    console.error("[cron] error:", err)
  }
});

// creates an alert 
app.post("/alert/discount", async (req, res) =>{
  try{
    const appid = parseInt(req.body.appid, 10);
    const email = String(req.body.email || "").trim().toLowerCase();
    const min_discount_percent = parseInt(req.body.min_discount_percent, 10);

    if(!appid){
      return res.status(400).json({ ok: false, error: "Missing or invalid appid"});
    }

    if(!email || !email.includes("@")){
      return res.status(400).json({ ok: false, error: "Missing or invalid email"});
    }

    if(!(min_discount_percent >= 1 && min_discount_percent <=100)){
      return res.status(400).json({ ok: false, error: "discount must be between 1-100"});
    }

    const{ rows } = await pool.query(
      `INSERT INTO discount_alert (appid, email, min_discount_percent)
      VALUES ($1, $2, $3)
      ON CONFLICT (appid, email, min_discount_percent)
      DO UPDATE SET active = TRUE
      RETURNING id, appid, email, min_discount_percent, active, latest_trigger, created_at`,
      [appid, email, min_discount_percent]
    );

    res.json({ ok: true, alert: rows[0]});
  }catch(err){
    console.error("alert/discount error:", err);
    res.status(500).json({ ok: false, error: "Failed to create alert"});
  }
});

// get alerts
/* 
  takes an email in the URL query
  looks in discount_alert table
  returns all alerts that belong to that email
*/
app.get("/alerts", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if(!email || !email.includes("@")){
      return res.status(400).json({ ok: false, error: "Missing or invalid email"});
    }

    const result = await pool.query(
      `SELECT id, appid, email, min_discount_percent, active, latest_trigger, created_at
      FROM discount_alert
      WHERE email = $1
      ORDER BY created_at DESC`,
      [email]
    );

    res.json({ ok: true, alerts: result.rows });
  }catch(err) {
    console.error("GET /alerts error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch alerts"});
  }
});

// alert deletation "stop notifying me for this alert"
app.delete("/alert/:id", async (req, res) =>{
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: "Missing or invalid id"});

    const { rows } = await pool.query(
      `UPDATE discount_alert
      SET active = FALSE
      WHERE id = $1
      RETURNING id, appid, email, min_discount_percent, active`,
      [id]
    );

    if (rows.length === 0){
      return res.status(404).json({ ok: false, error: "Alert not found"});
    }

    res.json({ ok: true, alert: rows[0]});
  }catch(err) {
    console.error("DELETE /alert/:id error:", err);
    res.status(500).json({ ok: false, error: "Failed to delete alert"});
  }
});

// email tester route (can delete later)
app.post("/test-email", async (req, res) => {
  try {
    const to = String(req.body.email || "").trim().toLowerCase();
    if (!to || !to.includes("@")) {
      return res.status(400).json({ ok: false, error: "Missing/invalid email" });
    }

    await emailAlert({
      to,
      gameName: "Test Game",
      appid: 123,
      discountPercent: 50,
      priceCents: 1999,
      currency: "CAD",
    });

    res.json({ ok: true, message: "Test email sent" });
  } catch (err) {
    console.error("test-email error:", err);
    res.status(500).json({ ok: false, error: "Failed to send test email" });
  }
});

// for each game: join its latest row from price_history 
app.get("/games/latest", async (req, res) =>{
  try{
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (g.appid)
        g.appid,
        g.name,
        g.tiny_image,
        ph.price_cents,
        ph.currency,
        ph.discount_percent,
        ph.recorded_at
      FROM games g
      LEFT JOIN price_history ph
        ON ph.appid = g.appid
      ORDER BY g.appid, ph.recorded_at DESC`
    );

    res.json({ ok: true, games: rows });
  }catch(err){
    console.error("GET /games/latest error:", err);
    res.status(500).json({ ok: false, error: "Failed to fetch latest prices" });
  }
});

// steam search results for adding a game route 
app.get("/steam/search", async (req, res) => {
  try {
    const term = (req.query.term || "").trim();
    if (!term) return res.json({ ok: true, games: []});

    const url = `https://store.steampowered.com/api/storesearch/` +
      `?term=${encodeURIComponent(term)}&l=en&cc=ca`;
    
    const steamRes = await axios.get(url);
    const items = steamRes.data?.items || [];

    const games = items.map((g) => ({
      appid: g.id,
      name: g.name,
      tiny_image: g.tiny_image ?? null,
    }));

    res.json({ ok: true, games});
  }catch(err) {
    console.log(err);
    res.status(500).json({ ok: false, error: "steam search failed"});
  }
});

// clicking add game route to update future list 
app.post("/games", async (req, res) => {
  try {
    const { appid, name, tiny_image } = req.body;

    if (!appid || !name) {
      return res.status(400).json({ ok: false, error: "Missing appid or name" });
    }

    const { rows } = await pool.query(
      `INSERT INTO games (appid, name, tiny_image)
       VALUES ($1, $2, $3)
       ON CONFLICT (appid) DO UPDATE
       SET name = EXCLUDED.name,
         tiny_image = COALESCE(EXCLUDED.tiny_image, games.tiny_image)
       RETURNING appid, name, tiny_image`,
      [appid, name, tiny_image || null]
    );

    const result = await syncSteam(appid); // fetch store price immediatly

    res.json({ ok: true, game: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Failed to add game" });
  }
});

// in order to remove a game from list
app.delete("/games/:appid", async (req, res) => {
  try {
    const appid = parseInt(req.params.appid, 10);
    if (!appid) return res.status(400).json({ ok: false, error: "Invalid appid" });

    // delete history first (because of FK)
    await pool.query("DELETE FROM price_history WHERE appid = $1", [appid]);
    await pool.query("DELETE FROM discount_alert WHERE appid = $1", [appid]);
    const result = await pool.query("DELETE FROM games WHERE appid = $1 RETURNING appid", [appid]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Game not found" });
    }

    res.json({ ok: true, removed: appid });
  } catch (err) {
    console.error("DELETE /games/:appid error:", err);
    res.status(500).json({ ok: false, error: "Failed to remove game" });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
