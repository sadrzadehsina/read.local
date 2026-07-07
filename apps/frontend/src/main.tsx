import React, {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import ReactDOM from "react-dom/client";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileCode,
  FileText,
  Folder,
  Moon,
  Plus,
  Sun,
  X
} from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Select } from "./components/ui/select";
import { cn } from "./lib/utils";
import "./styles.css";

type Source = {
  id: string;
  url: string;
  title: string;
  createdAt: string;
};

type Tag = {
  id: string;
  name: string;
};

type PostSummary = {
  id: string;
  sourceId: string;
  title: string;
  originalUrl: string;
  publishedAt: string;
  tags: Tag[];
};

type Post = PostSummary & {
  content: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
const themeStorageKey = "read-local-theme";

type Theme = "light" | "dark";
type ThemePreference = Theme | "system";
type InitialUrlSelection = {
  sourceId: string | null;
  postId: string | null;
  tagId: string | null;
};

function getSystemTheme(): Theme {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

function getInitialThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const storedTheme = window.localStorage.getItem(themeStorageKey);

  return storedTheme === "light" || storedTheme === "dark"
    ? storedTheme
    : "system";
}

function getInitialUrlSelection(): InitialUrlSelection {
  if (typeof window === "undefined") {
    return {
      sourceId: null,
      postId: null,
      tagId: null
    };
  }

  const params = new URLSearchParams(window.location.search);

  return {
    sourceId: params.get("source"),
    postId: params.get("post"),
    tagId: params.get("tag")
  };
}

function buildPostShareUrl(post: Post, selectedTagId: string) {
  const url = new URL(window.location.href);

  url.search = "";
  url.hash = "";
  url.searchParams.set("source", post.sourceId);
  url.searchParams.set("post", post.id);

  if (selectedTagId) {
    url.searchParams.set("tag", selectedTagId);
  }

  return url.toString();
}

function getExportUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function sanitizeHtml(html: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const blockedSelectors = [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "link",
    "meta",
    "base",
    "svg",
    "math"
  ];
  const safeProtocols = new Set(["http:", "https:", "mailto:"]);

  document.querySelectorAll(blockedSelectors.join(",")).forEach((node) => {
    node.remove();
  });

  document.body.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      if (name.startsWith("on") || name === "srcdoc" || name === "style") {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (name === "href" || name === "src" || name.endsWith(":href")) {
        try {
          const url = new URL(value, window.location.href);

          if (!safeProtocols.has(url.protocol)) {
            element.removeAttribute(attribute.name);
          }
        } catch {
          element.removeAttribute(attribute.name);
        }
      }
    }

    if (element.tagName.toLowerCase() === "a") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  });

  return document.body.innerHTML || "<p>No content available.</p>";
}

function Notice({
  children,
  variant = "default"
}: {
  children: React.ReactNode;
  variant?: "default" | "error";
}) {
  return (
    <p
      className={cn(
        "my-3 text-sm leading-6 text-muted-foreground",
        variant === "error" && "border-l-4 border-destructive pl-3 text-destructive"
      )}
    >
      {children}
    </p>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-xs font-extrabold uppercase tracking-normal text-muted-foreground">
      {children}
    </p>
  );
}

function EmptyDetail({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="min-w-0">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="m-0 text-3xl font-bold leading-tight text-foreground">{title}</h2>
      <p className="mt-4 max-w-[40ch] leading-7 text-muted-foreground">{children}</p>
    </article>
  );
}

function App() {
  const initialUrlSelectionRef = useRef(getInitialUrlSelection());
  const pendingInitialPostIdRef = useRef(initialUrlSelectionRef.current.postId);
  const [sources, setSources] = useState<Source[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    getInitialThemePreference
  );
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState(
    initialUrlSelectionRef.current.tagId ?? ""
  );
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [readerPost, setReaderPost] = useState<Post | null>(null);
  const [url, setUrl] = useState("");
  const [tagName, setTagName] = useState("");
  const [postsRefreshKey, setPostsRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [isLoadingReader, setIsLoadingReader] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingTag, setIsSubmittingTag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );

  const activeTheme = themePreference === "system" ? systemTheme : themePreference;

  const selectedPostIndex = useMemo(
    () => posts.findIndex((post) => post.id === selectedPostId),
    [posts, selectedPostId]
  );

  const canSelectPreviousPost = selectedPostIndex > 0;
  const canSelectNextPost =
    selectedPostIndex >= 0 && selectedPostIndex < posts.length - 1;

  const tagSuggestions = useMemo(
    () =>
      tags.filter(
        (tag) => !readerPost?.tags.some((postTag) => postTag.id === tag.id)
      ),
    [readerPost?.tags, tags]
  );

  const selectRelativePost = useCallback(
    (direction: -1 | 1) => {
      if (posts.length === 0) {
        return;
      }

      setSelectedPostId((currentId) => {
        const currentIndex = currentId
          ? posts.findIndex((post) => post.id === currentId)
          : -1;

        if (currentIndex === -1) {
          return direction > 0 ? posts[0].id : posts[posts.length - 1].id;
        }

        const nextIndex = currentIndex + direction;

        if (nextIndex < 0 || nextIndex >= posts.length) {
          return currentId;
        }

        return posts[nextIndex].id;
      });
    },
    [posts]
  );

  function toggleTheme() {
    const nextTheme: Theme = activeTheme === "dark" ? "light" : "dark";

    setThemePreference(nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [sourcesResponse, tagsResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/sources`),
          fetch(`${apiBaseUrl}/tags`)
        ]);

        if (!sourcesResponse.ok) {
          throw new Error("Unable to load sources.");
        }

        if (!tagsResponse.ok) {
          throw new Error("Unable to load tags.");
        }

        const nextSources = (await sourcesResponse.json()) as Source[];
        const nextTags = (await tagsResponse.json()) as Tag[];

        if (isMounted) {
          setSources(nextSources);
          setTags(nextTags);
          setSelectedSourceId((currentId) => {
            if (currentId) {
              return currentId;
            }

            const initialSourceId = initialUrlSelectionRef.current.sourceId;
            const initialSourceExists = nextSources.some(
              (source) => source.id === initialSourceId
            );

            return initialSourceExists
              ? initialSourceId
              : nextSources[0]?.id ?? null;
          });
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

    void loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemThemeChange(event: MediaQueryListEvent) {
      setSystemTheme(event.matches ? "dark" : "light");
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", activeTheme === "dark");
    document.documentElement.style.colorScheme = activeTheme;
  }, [activeTheme]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const params = new URLSearchParams();

    if (selectedSourceId) {
      params.set("source", selectedSourceId);
    }

    if (selectedPostId) {
      params.set("post", selectedPostId);
    }

    if (selectedTagId) {
      params.set("tag", selectedTagId);
    }

    const nextUrl = `${window.location.pathname}${
      params.size ? `?${params.toString()}` : ""
    }${window.location.hash}`;

    window.history.replaceState(null, "", nextUrl);
  }, [isLoading, selectedPostId, selectedSourceId, selectedTagId]);

  useEffect(() => {
    function handleKeyboardNavigation(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      const isEditing =
        target?.isContentEditable ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select";

      if (isEditing || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (event.key === "j") {
        event.preventDefault();
        selectRelativePost(1);
      }

      if (event.key === "k") {
        event.preventDefault();
        selectRelativePost(-1);
      }
    }

    window.addEventListener("keydown", handleKeyboardNavigation);

    return () => {
      window.removeEventListener("keydown", handleKeyboardNavigation);
    };
  }, [selectRelativePost]);

  useEffect(() => {
    setSelectedPostId(null);
    setReaderPost(null);
  }, [selectedSourceId, selectedTagId]);

  useEffect(() => {
    if (!selectedSourceId) {
      setPosts([]);
      return;
    }

    let isMounted = true;
    setIsLoadingPosts(true);
    setPostsError(null);

    async function loadPosts() {
      try {
        const params = new URLSearchParams();

        if (selectedTagId) {
          params.set("tagId", selectedTagId);
        }

        const response = await fetch(
          `${apiBaseUrl}/sources/${selectedSourceId}/posts${
            params.size ? `?${params.toString()}` : ""
          }`
        );

        if (!response.ok) {
          throw new Error("Unable to load posts.");
        }

        const nextPosts = (await response.json()) as PostSummary[];

        if (isMounted) {
          setPosts(nextPosts);

          const pendingPostId = pendingInitialPostIdRef.current;

          if (pendingPostId && nextPosts.some((post) => post.id === pendingPostId)) {
            setSelectedPostId(pendingPostId);
            pendingInitialPostIdRef.current = null;
          }
        }
      } catch (loadError) {
        if (isMounted) {
          setPostsError(
            loadError instanceof Error ? loadError.message : "Unable to load posts."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingPosts(false);
        }
      }
    }

    void loadPosts();

    return () => {
      isMounted = false;
    };
  }, [postsRefreshKey, selectedSourceId, selectedTagId]);

  useEffect(() => {
    if (!selectedPostId) {
      setReaderPost(null);
      return;
    }

    let isMounted = true;
    setIsLoadingReader(true);
    setReaderError(null);

    async function loadPost() {
      try {
        const response = await fetch(`${apiBaseUrl}/posts/${selectedPostId}`);

        if (!response.ok) {
          throw new Error("Unable to open post.");
        }

        const post = (await response.json()) as Post;

        if (isMounted) {
          setReaderPost(post);
        }
      } catch (loadError) {
        if (isMounted) {
          setReaderError(
            loadError instanceof Error ? loadError.message : "Unable to open post."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingReader(false);
        }
      }
    }

    void loadPost();

    return () => {
      isMounted = false;
    };
  }, [selectedPostId]);

  useEffect(() => {
    setShareStatus(null);
    setShareError(null);
  }, [selectedPostId]);

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
      setSelectedPostId(null);
      setUrl("");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to add source."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSelectSource(sourceId: string) {
    setSelectedSourceId(sourceId);
  }

  async function handleAddTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!readerPost) {
      return;
    }

    setIsSubmittingTag(true);
    setTagError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/posts/${readerPost.id}/tags`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: tagName })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? "Unable to add tag.");
      }

      const tag = (await response.json()) as Tag;

      setTags((currentTags) =>
        currentTags.some((currentTag) => currentTag.id === tag.id)
          ? currentTags
          : [...currentTags, tag].sort((left, right) => left.name.localeCompare(right.name))
      );
      setReaderPost((currentPost) =>
        currentPost && !currentPost.tags.some((currentTag) => currentTag.id === tag.id)
          ? { ...currentPost, tags: [...currentPost.tags, tag] }
          : currentPost
      );
      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === readerPost.id && !post.tags.some((currentTag) => currentTag.id === tag.id)
            ? { ...post, tags: [...post.tags, tag] }
            : post
        )
      );
      setTagName("");
      setPostsRefreshKey((key) => key + 1);
    } catch (submitError) {
      setTagError(
        submitError instanceof Error ? submitError.message : "Unable to add tag."
      );
    } finally {
      setIsSubmittingTag(false);
    }
  }

  async function handleRemoveTag(tagId: string) {
    if (!readerPost) {
      return;
    }

    setTagError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/posts/${readerPost.id}/tags/${tagId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error("Unable to remove tag.");
      }

      setReaderPost((currentPost) =>
        currentPost
          ? {
              ...currentPost,
              tags: currentPost.tags.filter((tag) => tag.id !== tagId)
            }
          : currentPost
      );
      setPosts((currentPosts) =>
        currentPosts.map((post) =>
          post.id === readerPost.id
            ? { ...post, tags: post.tags.filter((tag) => tag.id !== tagId) }
            : post
        )
      );
      setPostsRefreshKey((key) => key + 1);
    } catch (removeError) {
      setTagError(
        removeError instanceof Error ? removeError.message : "Unable to remove tag."
      );
    }
  }

  async function copyText(value: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textArea = document.createElement("textarea");
    textArea.value = value;
    textArea.setAttribute("readonly", "true");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.append(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  }

  async function handleCopyPostLink() {
    if (!readerPost) {
      return;
    }

    setShareStatus(null);
    setShareError(null);

    try {
      await copyText(buildPostShareUrl(readerPost, selectedTagId));
      setShareStatus("Local link copied.");
    } catch {
      setShareError("Unable to copy the local link.");
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-background text-foreground lg:grid-cols-[minmax(280px,340px)_1fr]">
      <aside
        className="border-b border-border bg-muted/45 p-4 sm:p-5 lg:min-h-screen lg:border-b-0 lg:border-r lg:p-6"
        aria-label="Newsletter sources"
      >
        <div className="mb-7 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary text-sm font-extrabold text-primary-foreground">
            R
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 text-[1.35rem] font-bold leading-tight">Read Local</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Newsletter sources</p>
          </div>
          <Button
            aria-label={`Switch to ${activeTheme === "dark" ? "light" : "dark"} mode`}
            size="icon"
            title={`Switch to ${activeTheme === "dark" ? "light" : "dark"} mode`}
            type="button"
            variant="outline"
            onClick={toggleTheme}
          >
            {activeTheme === "dark" ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        <form className="mb-5 grid gap-2" onSubmit={handleSubmit}>
          <label className="text-sm font-bold text-foreground" htmlFor="source-url">
            Newsletter URL
          </label>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              id="source-url"
              name="url"
              type="url"
              placeholder="https://example.com/feed"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
            <Button type="submit" disabled={isSubmitting}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {isSubmitting ? "Adding" : "Add"}
            </Button>
          </div>
        </form>

        {error ? <Notice variant="error">{error}</Notice> : null}

        <nav className="grid gap-1.5" aria-label="Saved sources">
          {isLoading ? <Notice>Loading sources...</Notice> : null}

          {!isLoading && sources.length === 0 ? (
            <Notice>Add a newsletter or feed URL to begin.</Notice>
          ) : null}

          {sources.map((source) => (
            <Button
              className={cn(
                "grid h-auto min-h-[58px] w-full grid-cols-[22px_minmax(0,1fr)] items-start justify-start gap-2.5 whitespace-normal px-2.5 py-2.5 text-left",
                source.id === selectedSourceId
                  ? "border border-border bg-muted text-foreground"
                  : "border border-transparent bg-transparent text-foreground hover:border-border hover:bg-muted"
              )}
              key={source.id}
              type="button"
              variant="ghost"
              onClick={() => handleSelectSource(source.id)}
            >
              <Folder className="mt-0.5 h-5 w-5 shrink-0 fill-primary/20 text-primary" />
              <span className="min-w-0">
                <strong className="block truncate text-[0.96rem]">{source.title}</strong>
                <small className="mt-1 block truncate text-xs text-muted-foreground">
                  {source.url}
                </small>
              </span>
            </Button>
          ))}
        </nav>
      </aside>

      <section
        className="grid min-w-0 grid-cols-1 md:grid-cols-[minmax(260px,36vw)_minmax(0,1fr)] lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]"
        aria-live="polite"
      >
        <section
          className="min-h-0 border-b border-border bg-card p-4 sm:p-5 md:min-h-screen md:border-b-0 md:border-r md:p-6 lg:p-8"
          aria-label="Posts"
        >
          {selectedSource ? (
            <>
              <header className="mb-6">
                <Eyebrow>Source</Eyebrow>
                <h2 className="m-0 break-words text-2xl font-bold leading-tight">
                  {selectedSource.title}
                </h2>
                <a
                  className="mt-2.5 inline-block break-all text-sm"
                  href={selectedSource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {selectedSource.url}
                </a>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <a href={getExportUrl(`/sources/${selectedSource.id}/export`)}>
                      <FileArchive className="h-4 w-4" aria-hidden="true" />
                      Export source
                    </a>
                  </Button>
                </div>
                <label className="mt-4 grid gap-1.5">
                  <span className="text-sm font-extrabold text-foreground">
                    Filter by tag
                  </span>
                  <Select
                    value={selectedTagId}
                    onChange={(event) => setSelectedTagId(event.target.value)}
                  >
                    <option value="">All posts</option>
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </Select>
                </label>
              </header>

              {postsError ? <Notice variant="error">{postsError}</Notice> : null}
              {isLoadingPosts ? <Notice>Loading posts...</Notice> : null}

              {!isLoadingPosts && posts.length === 0 ? (
                <Notice>No posts found yet.</Notice>
              ) : null}

              <div className="grid gap-2">
                {posts.map((post) => (
                  <Button
                    className={cn(
                      "grid h-auto min-h-[84px] w-full justify-start gap-2 whitespace-normal rounded-md border p-3.5 text-left",
                      post.id === selectedPostId
                        ? "border-primary/45 bg-accent text-foreground"
                        : "border-border bg-card text-foreground hover:border-primary/45 hover:bg-accent"
                    )}
                    key={post.id}
                    type="button"
                    variant="ghost"
                    onClick={() => setSelectedPostId(post.id)}
                  >
                    <span className="overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] text-[0.98rem] font-extrabold leading-snug">
                      {post.title}
                    </span>
                    {post.tags.length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {post.tags.map((tag) => (
                          <Badge key={tag.id} variant="secondary">
                            {tag.name}
                          </Badge>
                        ))}
                      </span>
                    ) : null}
                    <time className="text-xs text-muted-foreground" dateTime={post.publishedAt}>
                      {formatDate(post.publishedAt)}
                    </time>
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <EmptyDetail eyebrow="Source" title="No source selected">
              Add a newsletter URL, then select it from the sidebar.
            </EmptyDetail>
          )}
        </section>

        {selectedPostId ? (
          <article className="min-w-0 px-4 py-7 sm:px-5 md:px-8 lg:px-16 lg:py-14">
            {readerError ? <Notice variant="error">{readerError}</Notice> : null}
            {isLoadingReader ? <Notice>Opening post...</Notice> : null}

            {readerPost ? (
              <>
                <header className="mb-8 max-w-[760px]">
                  <Eyebrow>Reader</Eyebrow>
                  <h2 className="m-0 break-words font-serif text-[2.35rem] font-bold leading-[1.08] text-foreground sm:text-5xl xl:text-6xl">
                    {readerPost.title}
                  </h2>
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <time dateTime={readerPost.publishedAt}>
                      {formatDate(readerPost.publishedAt)}
                    </time>
                    <Button asChild variant="outline">
                      <a
                        href={readerPost.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        Open original in browser
                      </a>
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        aria-label="Previous post"
                        disabled={!canSelectPreviousPost}
                        size="icon"
                        title="Previous post"
                        type="button"
                        variant="outline"
                        onClick={() => selectRelativePost(-1)}
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label="Next post"
                        disabled={!canSelectNextPost}
                        size="icon"
                        title="Next post"
                        type="button"
                        variant="outline"
                        onClick={() => selectRelativePost(1)}
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <section className="mt-5 grid gap-3" aria-label="Post tags">
                    <div className="flex flex-wrap gap-2">
                      {readerPost.tags.length > 0 ? (
                        readerPost.tags.map((tag) => (
                          <Button
                            className="h-7 rounded-full px-2.5 text-xs"
                            key={tag.id}
                            type="button"
                            variant="secondary"
                            onClick={() => void handleRemoveTag(tag.id)}
                            title={`Remove ${tag.name}`}
                          >
                            {tag.name}
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        ))
                      ) : (
                        <Notice>No tags yet.</Notice>
                      )}
                    </div>
                    <form
                      className="grid max-w-sm grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                      onSubmit={handleAddTag}
                    >
                      <Input
                        aria-label="Tag name"
                        list="tag-suggestions"
                        placeholder="Add tag"
                        value={tagName}
                        onChange={(event) => setTagName(event.target.value)}
                      />
                      <datalist id="tag-suggestions">
                        {tagSuggestions.map((tag) => (
                          <option key={tag.id} value={tag.name} />
                        ))}
                      </datalist>
                      <Button type="submit" disabled={isSubmittingTag || !tagName.trim()}>
                        {isSubmittingTag ? "Adding" : "Add tag"}
                      </Button>
                    </form>
                    {tagError ? <Notice variant="error">{tagError}</Notice> : null}
                  </section>
                  <section className="mt-5 grid gap-3" aria-label="Sharing and export">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={handleCopyPostLink}>
                        {shareStatus ? (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        )}
                        Copy link
                      </Button>
                      <Button asChild variant="outline">
                        <a
                          href={getExportUrl(
                            `/posts/${readerPost.id}/export?format=html`
                          )}
                        >
                          <FileCode className="h-4 w-4" aria-hidden="true" />
                          Export HTML
                        </a>
                      </Button>
                      <Button asChild variant="outline">
                        <a
                          href={getExportUrl(
                            `/posts/${readerPost.id}/export?format=markdown`
                          )}
                        >
                          <FileText className="h-4 w-4" aria-hidden="true" />
                          Export Markdown
                        </a>
                      </Button>
                    </div>
                    {shareStatus ? (
                      <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
                        <Download className="h-4 w-4" aria-hidden="true" />
                        {shareStatus}
                      </p>
                    ) : null}
                    {shareError ? <Notice variant="error">{shareError}</Notice> : null}
                  </section>
                </header>
                <div
                  className="reader-content"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(readerPost.content) }}
                />
              </>
            ) : null}
          </article>
        ) : selectedSource ? (
          <article className="min-w-0 px-4 py-7 sm:px-5 md:px-8 lg:px-16 lg:py-14">
            <EmptyDetail eyebrow="Reader" title="Choose a post">
              Select a post from this source to read it here.
            </EmptyDetail>
          </article>
        ) : (
          <article className="min-w-0 px-4 py-7 sm:px-5 md:px-8 lg:px-16 lg:py-14">
            <EmptyDetail eyebrow="Reader" title="Nothing open">
              Your reading view will appear here.
            </EmptyDetail>
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
