import { useEffect, useState } from "react";
import "./AddGame.css";
import bg from "../assets/add-game.png";

export default function AddGame() {
  const [term, setTerm] = useState(""); // text in search box inorder for react to understand
  // term = current value
  // setTerm = a function to update it 
  const [games, setGames] = useState([]); // an array of serach results 
  const [added, setAdded] = useState(new Set()); // a set of appids - to disable buttons after adding 

  async function addGame(g) { // "g" the game object
  const res = await fetch("http://localhost:3030/games", { // calls backendAPI and adds game to DB
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appid: g.appid, name: g.name, tiny_image: g.tiny_image }),
  });

  const data = await res.json();

  if (!data.ok) {
    alert(data.error || "Failed to add game");
    return;
  }

   alert(`Added: ${data.game.name}`);
   setAdded((prev) => new Set(prev).add(g.appid)); 
   // !1.copies the previous set, 2.adds the appid, 3. triggers a re-render
}

  useEffect(() => { // a library import from react - runs code when somthing changes(works wirh term)
    const q = term.trim();
    if (!q) {
      return;
    }

    const id = setTimeout(async () => { // delay search (JavaScript function) - "run this function after x milliseconds" - id is a timer identifier
      try { // allows for search results to pop up 
        const res = await fetch(`http://localhost:3030/steam/search?term=${encodeURIComponent(q)}`);
        const data = await res.json();
        setGames(data.games || []);
      } catch (e) {
        console.error(e);
      }
    }, 300); // wait 300ms

    return () => clearTimeout(id); // runs when term changes - it cancels prevoius timer 
  }, [term]);

  return (
    <div className="add-game" style={{ backgroundImage: `url(${bg})` }}>
      <div className="panel">
          <input
            className="search-input"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            // activated when user starts typing in search bar
            // e.target.value = what is in the input 
            // setTerm() updates react state 
            placeholder="Search by game name..."
         />

        <div className="results">
          {games.map((g) => ( // map turns each game object into JSX (for each game draw one row)
            <div key={g.appid} className="result-row">
              {g.tiny_image && <img className="picture" src={g.tiny_image} alt="" />}
              <div className="result-text">
                <div className="name">{g.name}</div>
                <div className="appid">{g.appid}</div>
             </div>
              <button className="add-btn" 
                disabled={added.has(g.appid)}
                onClick={() => addGame(g)}
              >
                {added.has(g.appid) ? "Added" : "Add"}
              </button>
            </div>
        ))}
      </div>
    </div>
  </div>
  );
}