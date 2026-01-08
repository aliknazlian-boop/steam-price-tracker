const { Pool } = require("pg");

const pool = new Pool({
  user: "steam",
  password: "steam",
  host: "localhost",
  port: 5432,
  database: "steam_prices",
});

module.exports = pool;