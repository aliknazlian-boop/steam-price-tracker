import { useEffect, useMemo, useState } from "react";
import "./MyGames.css";

const API = "http://localhost:3030";

function formatPrice(price_cents, currency) {
  if (price_cents == null) return null; // if backend game null treat it as free
  const amount = (price_cents / 100).toFixed(2); // convert cents to dollars (force 2 decimals)
  return `$${amount} ${currency || ""}`.trim(); // builds string of money amount and currency (trim() for removing trailing space)
}

function formatUpdated(recorded_at) {
  if (!recorded_at) return "—"; // if there is no time stamp it shows —
  return new Date(recorded_at).toLocaleString(); 
  // converts the timestamp into JS date
  // formats under local date and time formate 
}

function priceForSort(price_cents) { 
  if (price_cents == null) return 0; // make free a number for sorting
  return price_cents;
}

export default function MyGames() {
  const [games, setGames] = useState([]); // list of game rows to display
  const [loading, setLoading] = useState(true); // wether its currenctly fetching from backend
  const [err, setErr] = useState(""); // error message string to in the UI ("" for no error)

  const [query, setQuery] = useState(""); // text in searching game list 
  const [sortLowest, setSortLowest] = useState(false); // if true, sort games by lowest price

  const [alertEmail, setAlertEmail] = useState(""); // stores what user types in the alert email input box
  const [minDisc, setMinDisc] = useState(""); // stores the discount typed in min discount box 

  async function load() {
    try {
      setErr(""); // clear old error 
      setLoading(true); // turns loading on
      const res = await fetch(`${API}/games/latest`); // calls backend endpoint
      const data = await res.json(); 
      if (!data.ok) throw new Error(data.error || "Failed to load games"); // if backend says ok: false 
      setGames(data.games || []); // if successful stores games in a list
    } catch (e) {
      setErr(e.message || "Something went wrong");
    } finally {
      setLoading(false); // turns loading off
    }
  }

  async function removeGame(appid) { // in order to remove a game from the list
    try {
      const res = await fetch(`${API}/games/${appid}`, { method: "DELETE" }); // sends delete request to backend for said appid
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to remove game"); // send error if failed

      setGames((prev) => prev.filter((g) => g.appid !== appid)); // updates UI instatly by removing it from games state using filter
      // .filter() (JS tool) - returns a new array after it loops through an array, keeps items that return true and removes the ones that return false
    } catch (e) {
      alert(e.message || "Remove failed"); // displays alert if failure
    }
  }

  // when you click create on a specific game row - it creates a discount alert
  async function createAlertFor(appid) {
    try {
      const email = alertEmail.trim().toLowerCase(); // store inserted email
      const min_discount_percent = parseInt(minDisc, 10); // store inserted discount 

      // validate before continuing 
      if (!email || !email.includes("@")) {
        alert("Enter a valid email for alerts");
        return;
      }

      if (!(min_discount_percent >= 1 && min_discount_percent <= 100)) {
        alert("Discount must be between 1 and 100");
        return;
      }

      // send a POST request to backend
      const res = await fetch(`${API}/alert/discount`, {
        method: "POST", // create something
        headers: { "Content-Type": "application/json" }, // sending JSON
        body: JSON.stringify({ appid, email, min_discount_percent }), // makes it readable
      });

      // read response and handle errors 
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to create alert");

      // notification when successful or not 
      alert(`Alert created for appid ${appid} at -${min_discount_percent}%`);
    } catch (e) {
      alert(e.message || "Failed to create alert");
    }
  }

  useEffect(() => {
    load();
  }, []); // run only once when the page first opens 

  const shown = useMemo(() => {
    // computes when games, query, or sortLowest changes 
    const q = query.trim().toLowerCase();

    let list = games; // start with all games 

    if (q) { // goes through every game g when user is using search box
      list = list.filter((g) => (g.name || "").toLowerCase().includes(q));
      // if name is missing, use empty string (make it case sensitive)
      // filter returns new array
    }

    // shows list when sorted by lowest price 
    if (sortLowest) {
      list = [...list].sort((a, b) => priceForSort(a.price_cents) - priceForSort(b.price_cents));
      // [...list] creates a shallow copy
      // subtraction sort accending (lowest to highest)
    }

    return list;
  }, [games, query, sortLowest]);

  return (
    <div className="mygames-page">
      <div className="mygames-top">
        <h1 className="mygames-title">MY GAMES</h1>

        <div className="mygames-controls">
          <input
            className="mygames-search"
            placeholder="Search games…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <label className="mygames-toggle">
            <input
              type="checkbox"
              checked={sortLowest}
              onChange={(e) => setSortLowest(e.target.checked)}
            />
            Lowest Price
          </label>

          <input
            className="alerts-email-mini"
            placeholder="Alert email…"
            value={alertEmail}
            onChange={(e) => setAlertEmail(e.target.value)}
          />

          <input
            className="alerts-min-mini"
            placeholder="Min %"
            value={minDisc}
            onChange={(e) => setMinDisc(e.target.value)}
          />

          <button className="mygames-refresh" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {err && <div className="mygames-error">{err}</div>}

      <div className="mygames-card">
        <div className="mygames-row mygames-head">
          <div className="col-game">Game</div>
          <div className="col-price">Price</div>
          <div className="col-discount">Discount</div>
          <div className="col-updated">Updated</div>
          <div className="col-alert">Alert</div>
          <div className="col-remove">Remove</div>
        </div>

        {!loading && shown.length === 0 && (
          <div className="mygames-empty">No games found.</div>
        )}

        {shown.map((g) => {
          const price = formatPrice(g.price_cents, g.currency);

          return (
            <div className="mygames-row" key={g.appid}>
              <div className="col-game"> 
                <div className="game-cell">
                  <img
                    className="tiny-img"
                    src={g.tiny_image || "/placeholder.png"}
                    alt=""
                    loading="lazy"
                    onError={(e) => (e.currentTarget.src = "/placeholder.png")}
                  />
                  <div className="game-name">{g.name}</div>
                </div>
              </div>

              <div className="col-price">
                {price ? <span>{price}</span> : <span className="price-free">Free</span>}
              </div>

              <div className="col-discount">
                {g.discount_percent > 0 ? (
                  <span className="discount-pill">-{g.discount_percent}%</span>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>

              <div className="col-updated">
                <span className="muted">{formatUpdated(g.recorded_at)}</span>
              </div>

              <div className="col-alert">
                <button className="alert-btn" onClick={() => createAlertFor(g.appid)}>
                  Create
                </button>
              </div>

              <div className="col-remove">
                <button className="remove-btn" onClick={() => removeGame(g.appid)}>
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
