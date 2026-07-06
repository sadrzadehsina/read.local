import React, { FormEvent, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

type Source = {
  id: string;
  url: string;
  title: string;
  createdAt: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

function App() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadSources() {
      try {
        const response = await fetch(`${apiBaseUrl}/sources`);

        if (!response.ok) {
          throw new Error("Unable to load sources.");
        }

        const nextSources = (await response.json()) as Source[];

        if (isMounted) {
          setSources(nextSources);
          setSelectedSourceId((currentId) => currentId ?? nextSources[0]?.id ?? null);
          setError(null);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load sources."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSources();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/sources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? "Unable to add source.");
      }

      const source = (await response.json()) as Source;

      setSources((currentSources) => [source, ...currentSources]);
      setSelectedSourceId(source.id);
      setUrl("");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to add source."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Newsletter sources">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            R
          </span>
          <div>
            <h1>Read Local</h1>
            <p>Newsletter sources</p>
          </div>
        </div>

        <form className="source-form" onSubmit={handleSubmit}>
          <label htmlFor="source-url">Newsletter URL</label>
          <div className="source-input-row">
            <input
              id="source-url"
              name="url"
              type="url"
              placeholder="https://example.com/feed"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding" : "Add"}
            </button>
          </div>
        </form>

        {error ? <p className="notice error">{error}</p> : null}

        <nav className="source-list" aria-label="Saved sources">
          {isLoading ? <p className="notice">Loading sources...</p> : null}

          {!isLoading && sources.length === 0 ? (
            <p className="notice">Add a newsletter or feed URL to begin.</p>
          ) : null}

          {sources.map((source) => (
            <button
              className={source.id === selectedSourceId ? "source active" : "source"}
              key={source.id}
              type="button"
              onClick={() => setSelectedSourceId(source.id)}
            >
              <span className="folder" aria-hidden="true" />
              <span>
                <strong>{source.title}</strong>
                <small>{source.url}</small>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="detail" aria-live="polite">
        {selectedSource ? (
          <article>
            <p className="eyebrow">Source</p>
            <h2>{selectedSource.title}</h2>
            <a href={selectedSource.url} target="_blank" rel="noreferrer">
              {selectedSource.url}
            </a>
            <dl>
              <div>
                <dt>Added</dt>
                <dd>{new Date(selectedSource.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>Ingestion starts automatically when a source is added.</dd>
              </div>
            </dl>
            <section className="posts-placeholder" aria-label="Posts">
              <h3>Posts</h3>
              <p>No posts to show yet.</p>
            </section>
          </article>
        ) : (
          <article className="empty-detail">
            <p className="eyebrow">Source</p>
            <h2>No source selected</h2>
            <p>Add a newsletter URL, then select it from the sidebar.</p>
          </article>
        )}
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
