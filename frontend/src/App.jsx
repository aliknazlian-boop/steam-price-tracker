import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import AddGame from "./pages/AddGame";
import MyGames from "./pages/MyGames";
import MyAlerts from "./pages/MyAlerts";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/add" element={<AddGame />} />
        <Route path="/games" element={<MyGames />} />
        <Route path="/alerts" element={<MyAlerts />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;