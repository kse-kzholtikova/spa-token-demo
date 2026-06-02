import { useState, useEffect, useCallback } from "react";
import keycloak from "./keycloak.js";
import { fetchNotes, createNote, deleteNote } from "./api.js";

function decodeJwtPart(part) {
  if (!part) return null;
  try {
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  if (!token) return null;
  const parts = token.split(".");
  return parts.length >= 2 ? decodeJwtPart(parts[1]) : null;
}

function decodeJwtHeader(token) {
  if (!token) return null;
  const parts = token.split(".");
  return parts.length >= 2 ? decodeJwtPart(parts[0]) : null;
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [tokenDump, setTokenDump] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [keycloakReady, setKeycloakReady] = useState(false);

  useEffect(() => {
    keycloak
      .init({ onLoad: "check-sso", checkLoginIframe: false })
      .then((auth) => {
        setKeycloakReady(true);
        if (auth) {
          handleAuthenticated();
        }
      })
      .catch((err) => {
        console.error("Keycloak init failed", err);
        setKeycloakReady(true);
      });
  }, []);

  function handleAuthenticated() {
    persistTokens();
    setAuthenticated(true);
    setUsername(keycloak.tokenParsed?.preferred_username || "unknown");

    // Refresh token before it expires
    setInterval(() => {
      keycloak
        .updateToken(30)
        .then((refreshed) => {
          if (refreshed) {
            persistTokens();
          }
        })
        .catch(() => {
          console.error("Token refresh failed");
          handleLogout();
        });
    }, 30000);
  }

  function persistTokens() {
    const dump = buildTokenDump();

    // Store tokens in localStorage (deliberate choice for demo purposes)
    localStorage.setItem("access_token", dump.tokens.access.value);
    localStorage.setItem("id_token", dump.tokens.id.value);
    localStorage.setItem("refresh_token", dump.tokens.refresh.value);
    setTokenDump(dump);
  }

  function buildTokenDump() {
    const accessToken = keycloak.token || "";
    const idToken = keycloak.idToken || "";
    const refreshToken = keycloak.refreshToken || "";

    return {
      dumpedAt: new Date().toISOString(),
      githubUsername: "torinks",
      keycloakUsername: keycloak.tokenParsed?.preferred_username || "unknown",
      tokens: {
        access: {
          storageKey: "access_token",
          value: accessToken,
          header: decodeJwtHeader(accessToken),
          payload: decodeJwtPayload(accessToken),
        },
        id: {
          storageKey: "id_token",
          value: idToken,
          header: decodeJwtHeader(idToken),
          payload: decodeJwtPayload(idToken),
        },
        refresh: {
          storageKey: "refresh_token",
          value: refreshToken,
          header: decodeJwtHeader(refreshToken),
          payload: decodeJwtPayload(refreshToken),
        },
      },
    };
  }

  function downloadTokenDump() {
    if (!tokenDump) return;

    const blob = new Blob([JSON.stringify(tokenDump, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spa-token-dump-${tokenDump.githubUsername}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const loadNotes = useCallback(async () => {
    try {
      setError("");
      const data = await fetchNotes();
      setNotes(data);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadNotes();
    }
  }, [authenticated, loadNotes]);

  function handleLogin() {
    keycloak.login().then(() => handleAuthenticated());
  }

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("id_token");
    localStorage.removeItem("refresh_token");
    setAuthenticated(false);
    setUsername("");
    setNotes([]);
    setTokenDump(null);
    keycloak.logout({ redirectUri: window.location.origin });
  }

  async function handleCreateNote(e) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      setError("");
      await createNote(title.trim(), content.trim());
      setTitle("");
      setContent("");
      await loadNotes();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteNote(id) {
    try {
      setError("");
      await deleteNote(id);
      await loadNotes();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!keycloakReady) {
    return (
      <div style={styles.container}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div style={styles.container}>
        <h1>SPA Token Demo</h1>
        <p>Token-based authentication with Keycloak</p>
        <button onClick={handleLogin} style={styles.button}>
          Log in with Keycloak
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>SPA Token Demo</h1>
        <div>
          Logged in as <strong>{username}</strong>{" "}
          <button onClick={handleLogout} style={styles.buttonSmall}>
            Log out
          </button>
        </div>
      </header>

      {error && <div style={styles.error}>{error}</div>}

      {/* Create note form */}
      <section style={styles.section}>
        <h2>Create Note</h2>
        <form onSubmit={handleCreateNote} style={styles.form}>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={styles.input}
          />
          <textarea
            placeholder="Content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            style={styles.input}
          />
          <button type="submit" style={styles.button}>
            Add Note
          </button>
        </form>
      </section>

      {/* Notes list */}
      <section style={styles.section}>
        <h2>My Notes</h2>
        {notes.length === 0 ? (
          <p>No notes yet.</p>
        ) : (
          <ul style={styles.noteList}>
            {notes.map((note) => (
              <li key={note.id} style={styles.noteItem}>
                <div>
                  <strong>{note.title}</strong>
                  <p style={styles.noteContent}>{note.content}</p>
                  <small style={styles.noteDate}>
                    {new Date(note.createdAt).toLocaleString()}
                  </small>
                </div>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  style={styles.deleteButton}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* JWT Token Inspector */}
      <section style={styles.section}>
        <h2>
          Token Inspector{" "}
          <button
            onClick={() => setShowToken(!showToken)}
            style={styles.buttonSmall}
          >
            {showToken ? "Hide" : "Show"}
          </button>
          {showToken && tokenDump && (
            <button onClick={downloadTokenDump} style={styles.buttonSmall}>
              Download JSON
            </button>
          )}
        </h2>
        {showToken && tokenDump && (
          <div>
            <p style={{ fontSize: "0.85em", color: "#666", marginBottom: "1rem" }}>
              Tokens are stored in <code>localStorage</code> for this lab.
              Open DevTools {"->"} Application {"->"} Local Storage to inspect them.
              Dumped at: {tokenDump.dumpedAt}
            </p>

            {[
              { label: "Access Token", data: tokenDump.tokens.access, color: "#1a73e8" },
              { label: "ID Token", data: tokenDump.tokens.id, color: "#0d652d" },
              { label: "Refresh Token", data: tokenDump.tokens.refresh, color: "#8b5e00" },
            ].map(({ label, data, color }) => (
              <details key={label} style={styles.tokenSection}>
                <summary style={{ ...styles.tokenSummary, borderLeftColor: color }}>
                  <strong>{label}</strong>
                  {data.payload?.exp && (
                    <span style={styles.tokenMeta}>
                      exp: {new Date(data.payload.exp * 1000).toLocaleTimeString()}
                    </span>
                  )}
                  {data.header?.alg && (
                    <span style={styles.tokenMeta}>alg: {data.header.alg}</span>
                  )}
                </summary>
                <div style={styles.tokenDetails}>
                  <div style={styles.tokenSubSection}>
                    <strong>JOSE Header:</strong>
                    <pre style={styles.tokenBlock}>
                      {JSON.stringify(data.header, null, 2)}
                    </pre>
                  </div>
                  <div style={styles.tokenSubSection}>
                    <strong>Payload:</strong>
                    <pre style={styles.tokenBlock}>
                      {JSON.stringify(data.payload, null, 2)}
                    </pre>
                  </div>
                  <div style={styles.tokenSubSection}>
                    <strong>Raw JWT:</strong>
                    <pre style={{ ...styles.tokenBlock, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
                      {data.value}
                    </pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 700,
    margin: "0 auto",
    padding: "2rem 1rem",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #ddd",
    paddingBottom: "1rem",
    marginBottom: "1.5rem",
  },
  section: {
    marginBottom: "2rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  input: {
    padding: "0.5rem",
    fontSize: "1rem",
    border: "1px solid #ccc",
    borderRadius: 4,
  },
  button: {
    padding: "0.6rem 1.2rem",
    fontSize: "1rem",
    backgroundColor: "#1a73e8",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  },
  buttonSmall: {
    padding: "0.3rem 0.8rem",
    fontSize: "0.85rem",
    backgroundColor: "#555",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  },
  error: {
    padding: "0.8rem",
    backgroundColor: "#fdd",
    color: "#900",
    borderRadius: 4,
    marginBottom: "1rem",
  },
  noteList: {
    listStyle: "none",
    padding: 0,
  },
  noteItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "0.8rem",
    borderBottom: "1px solid #eee",
  },
  noteContent: {
    margin: "0.3rem 0",
    color: "#555",
  },
  noteDate: {
    color: "#999",
  },
  deleteButton: {
    padding: "0.3rem 0.6rem",
    fontSize: "0.85rem",
    backgroundColor: "#d32f2f",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
  },
  tokenSection: {
    marginBottom: "0.8rem",
    border: "1px solid #e0e0e0",
    borderRadius: 4,
  },
  tokenSummary: {
    padding: "0.6rem 0.8rem",
    cursor: "pointer",
    backgroundColor: "#fafafa",
    borderLeft: "4px solid #999",
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  tokenMeta: {
    fontSize: "0.8rem",
    color: "#666",
    fontFamily: "monospace",
  },
  tokenDetails: {
    padding: "0.8rem",
  },
  tokenSubSection: {
    marginBottom: "0.6rem",
  },
  tokenBlock: {
    backgroundColor: "#f5f5f5",
    padding: "0.8rem",
    borderRadius: 4,
    overflow: "auto",
    fontSize: "0.8rem",
    maxHeight: 300,
    margin: "0.3rem 0 0 0",
  },
};

export default App;
