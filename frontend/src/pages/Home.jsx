import "./Home.css"; // import the CSS
import { useNavigate } from "react-router-dom";

import bg from "../assets/steam-price-tracker.png"; // background image from canva

export default function Home() {
  const navigate = useNavigate();
  return ( 
    <div className="home" 
    style={{ backgroundImage: `url(${bg})` }}
    > 
      <div className="layout">
        
        <button 
          className="btn btn-primary"
          onClick={() => navigate("/add")}
        >
          + ADD GAME
        </button>

        <div className="btn-row">
          <button 
            className="btn btn-secondary"
            onClick={() => navigate("/games")}
          >
            MY GAMES
          </button>

          <button 
            className="btn btn-secondary"
            onClick={() => navigate("/alerts")}
          >
            MY ALERTS
          </button>
        </div>
      </div>
    </div>
  );
}
