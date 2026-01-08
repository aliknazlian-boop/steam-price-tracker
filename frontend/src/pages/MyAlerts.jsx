import { useState } from "react";
import "./MyAlerts.css";
import bg from "../assets/alerts.jpg";

const API = import.meta.env.VITE_API_URL;

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

export default function MyAlerts() {
  const [email, setEmail] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function loadAlerts(e) {
    const clean = String(e || "").trim().toLowerCase();
    if (!clean || !clean.includes("@")) {
      setErr("Enter a valid email to load alerts.");
      setAlerts([]);
      return;
    }

    try {
      setErr("");
      setLoading(true);

      const res = await fetch(`${API}/alerts?email=${encodeURIComponent(email)}`);
      const data = await res.json();

      if (!data.ok) throw new Error(data.error || "Failed to load alerts");
      setAlerts(data.alerts || []);
    } catch (ex) {
      setErr(ex.message || "Something went wrong");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }

  async function disableAlert(id) {
    try {
      const res = await fetch(`${API}/alert/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to disable alert");

      // update UI instantly
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, active: false } : a))
      );
    } catch (ex) {
      alert(ex.message || "Disable failed");
    }
  }

  // optional: if user already typed an email and refreshes page,
  // nothing auto-loads. Keeping it manual is simplest.

  const shown = alerts;

  return (
    <div className="alerts-page"
      style={{ backgroundImage: `url(${bg})`,
      backgroundSize: "cover",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      minHeight: "100vh",
    }}
    >
      <div className="alerts-top">
        <h1 className="alerts-title">MY ALERTS</h1>

        <div className="alerts-controls">
          <input
            className="alerts-email"
            placeholder="Email used for alerts…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <button
            className="alerts-load"
            onClick={() => loadAlerts(email)}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load"}
          </button>
        </div>
      </div>

      {err && <div className="alerts-error">{err}</div>}

      <div className="alerts-card">
        <div className="alerts-row alerts-head">
          <div className="col-appid">AppID</div>
          <div className="col-min">Min discount</div>
          <div className="col-active">Status</div>
          <div className="col-last">Last email</div>
          <div className="col-created">Created</div>
          <div className="col-action">Action</div>
        </div>

        {!loading && shown.length === 0 && (
          <div className="alerts-empty">No alerts found.</div>
        )}

        {shown.map((a) => (
          <div className="alerts-row" key={a.id}>
            <div className="col-appid">{a.appid}</div>

            <div className="col-min">
              <span className="pill">-{a.min_discount_percent}%</span>
            </div>

            <div className="col-active">
              {a.active ? (
                <span className="status-on">Active</span>
              ) : (
                <span className="status-off">Off</span>
              )}
            </div>

            <div className="col-last">
              <span className="muted">{fmtDate(a.latest_trigger)}</span>
            </div>

            <div className="col-created">
              <span className="muted">{fmtDate(a.created_at)}</span>
            </div>

            <div className="col-action">
              <button
                className="alerts-disable"
                onClick={() => disableAlert(a.id)}
                disabled={!a.active}
              >
                {a.active ? "Disable" : "Disabled"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
