import KNOWN_BOTS from "./bots.js";

// localStorage keys for persisted form state.
// Note: the PAT is stored in cleartext by design (client-side only tool);
// the XSS hardening below is what keeps that acceptable.
const SK = {
    repoList: "gfd_repoList",
    apiToken: "gfd_apiToken",
    commitMessage: "gfd_commitMessage",
    extendedDescription: "gfd_extendedDesc",
    selectedBots: "gfd_selectedBots",
    deployMethod: "gfd_deployMethod",
    prBranch: "gfd_prBranch",
    prTitle: "gfd_prTitle",
    prBody: "gfd_prBody"
};

const PERSISTED_IDS = ["repoList", "apiToken", "commitMessage", "extendedDescription", "prBranch", "prTitle", "prBody"];
const DEPLOY_METHODS = ["commit", "pr"];
const LOG_TYPES = new Set(["info", "success", "error", "warn"]);

// GitHub naming rules, used to reject malformed input before it is ever
// interpolated into API URLs.
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

const ICON_UPLOAD = `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14ZM11.28 4.72a.749.749 0 1 1-1.06 1.06L8.75 4.31v6.94a.75.75 0 0 1-1.5 0V4.31L5.78 5.78a.749.749 0 1 1-1.06-1.06l3-3a.75.75 0 0 1 1.06 0Z"/></svg>`;
const ICON_FILE = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/></svg>`;

let selectedFiles = [];

function $(id) { return document.getElementById(id); }

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function restore() {
    PERSISTED_IDS.forEach(id => {
        const v = localStorage.getItem(SK[id]);
        if (v !== null && $(id)) $(id).value = v;
    });
    // Ignore corrupted/unknown values stored by older versions.
    const saved = localStorage.getItem(SK.deployMethod);
    setDeployMethod(DEPLOY_METHODS.includes(saved) ? saved : "commit");
}

function persist(id) {
    const el = $(id);
    if (!el || !SK[id]) return;
    el.addEventListener("input", () => localStorage.setItem(SK[id], el.value));
}

function getDeployMethod() {
    const active = document.querySelector("#deployMethod .seg-btn.active");
    return active ? active.dataset.value : "commit";
}

function setDeployMethod(val) {
    document.querySelectorAll("#deployMethod .seg-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.value === val);
    });
    $("prOptions").classList.toggle("hidden", val !== "pr");
    $("submitLabel").textContent = val === "pr" ? "Create PRs in all repositories" : "Deploy to all repositories";
    localStorage.setItem(SK.deployMethod, val);
}

function buildCoauthorGrid() {
    const grid = $("coauthorGrid");
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(SK.selectedBots) || "[]"); } catch { /* Corrupted storage: select none. */ }

    KNOWN_BOTS.forEach(bot => {
        const item = document.createElement("label");
        item.className = "coauthor-item" + (saved.includes(bot.login) ? " selected" : "");
        item.dataset.login = bot.login.toLowerCase();

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = bot.login;
        cb.checked = saved.includes(bot.login);

        const avatar = document.createElement("img");
        avatar.className = "coauthor-avatar";
        avatar.src = `https://github.com/${encodeURIComponent(bot.login)}.png?size=40`;
        avatar.alt = "";
        avatar.loading = "lazy";
        avatar.onerror = function() { this.style.display = "none"; };

        const span = document.createElement("span");
        span.className = "coauthor-login";
        span.textContent = bot.login;

        item.append(cb, avatar, span);
        cb.addEventListener("change", () => {
            item.classList.toggle("selected", cb.checked);
            saveSelectedBots();
            updateCoauthorCount();
        });
        grid.appendChild(item);
    });

    updateCoauthorCount();
}

function saveSelectedBots() {
    const checks = document.querySelectorAll("#coauthorGrid input[type=checkbox]:checked");
    localStorage.setItem(SK.selectedBots, JSON.stringify(Array.from(checks).map(c => c.value)));
}

function updateCoauthorCount() {
    const n = document.querySelectorAll("#coauthorGrid input[type=checkbox]:checked").length;
    const el = $("coauthorCount");
    el.textContent = n;
    el.classList.toggle("visible", n > 0);
}

function getCoauthorTrailers() {
    const checks = document.querySelectorAll("#coauthorGrid input[type=checkbox]:checked");
    return Array.from(checks).map(cb => {
        const bot = KNOWN_BOTS.find(b => b.login === cb.value);
        const id = bot && bot.id ? bot.id : 0;
        return `Co-authored-by: ${cb.value} <${id}+${cb.value}@users.noreply.github.com>`;
    });
}

// Only allows https links back to GitHub. html_url values come from API
// responses and must never be able to smuggle in javascript: or external URLs.
function sanitizeExternalUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") return null;
        if (parsed.hostname !== "github.com" && !parsed.hostname.endsWith(".github.com")) return null;
        return parsed.href;
    } catch {
        return null;
    }
}

function addLog(target, message, type = "info", link = null) {
    const log = $("statusLog");
    const entry = document.createElement("div");
    // Whitelist log types so `type` can never inject unexpected class names.
    entry.className = `log-entry log-${LOG_TYPES.has(type) ? type : "info"}`;

    const title = document.createElement("strong");
    title.textContent = `${target}:`;

    // Built with textContent, never innerHTML: API error messages, repo names
    // and commit URLs are untrusted input and must not inject markup into a
    // page that also holds the user's access token.
    const body = document.createElement("span");
    body.textContent = message;

    if (link) {
        const safeUrl = sanitizeExternalUrl(link.url);
        if (safeUrl) {
            body.appendChild(document.createTextNode(" — "));
            const anchor = document.createElement("a");
            anchor.href = safeUrl;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            anchor.textContent = link.label;
            body.appendChild(anchor);
        }
    }

    entry.append(title, body);
    log.appendChild(entry);
    entry.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateProgress(current, total) {
    const fill = document.querySelector(".progress-bar-fill");
    if (!fill || total <= 0) return;
    fill.style.width = `${Math.min(100, (current / total) * 100)}%`;
}

function parseRepo(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const urlMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i);
    let segments;
    if (urlMatch) {
        // Full GitHub URL: take the first two path segments (owner/repo) and
        // ignore any deeper path (/pulls, /tree/main), query or fragment.
        segments = urlMatch[1].split(/[?#]/)[0].split("/").filter(Boolean).slice(0, 2);
    } else {
        // Shorthand form: must be exactly "owner/repo".
        segments = trimmed.split("/").filter(Boolean);
        if (segments.length !== 2) return null;
    }
    if (segments.length < 2) return null;

    const [owner, rawRepo] = segments;
    const repo = rawRepo.replace(/\.git$/i, "");
    if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || !repo.replace(/\./g, "")) return null;
    return { owner, repo };
}

function apiHeaders(token) {
    return {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
    };
}

// Builds a descriptive Error from a failed API response. The body is consumed
// exactly once (it cannot be read twice) and may not be JSON at all.
async function apiError(response, fallback) {
    let detail = "";
    try {
        const data = await response.json();
        if (data && typeof data.message === "string") detail = data.message;
    } catch { /* Non-JSON body; the status line alone is still useful. */ }
    const status = `${response.status} ${response.statusText}`.trim();
    return new Error(`${fallback} (${status}${detail ? `: ${detail}` : ""})`);
}

// fetch() wrapper for the GitHub API: throws an Error carrying the API's own
// message on failure and resolves with the parsed JSON body on success.
async function ghFetch(url, options, fallback) {
    const response = await fetch(url, options);
    if (!response.ok) throw await apiError(response, fallback);
    return response.json();
}

function repoApiBase(owner, repo) {
    // Names are validated by parseRepo; encodeURIComponent is defense in depth.
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

// Normalizes a file path for the Git tree API: forward slashes only, no empty,
// "." or ".." segments that the API would reject (or that could confuse tools cloning the repo).
function sanitizeRepoPath(path) {
    return String(path).replace(/\\/g, "/").split("/")
        .filter(segment => segment && segment !== "." && segment !== "..")
        .join("/");
}

function withCustomPath(file) {
    file.customPath = file.webkitRelativePath || file.name;
    return file;
}

async function getFilesFromDataTransfer(dataTransfer) {
    const items = dataTransfer.items;
    // Browsers without webkitGetAsEntry (e.g. Firefox) cannot traverse dropped
    // directories; fall back to the flat file list instead of crashing.
    const canTraverse = items.length > 0 && typeof items[0].webkitGetAsEntry === "function";
    if (!canTraverse) {
        return Array.from(dataTransfer.files).map(withCustomPath);
    }

    const files = [];
    const queue = [];
    for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
            const entry = items[i].webkitGetAsEntry();
            if (entry) queue.push(entry);
        }
    }

    while (queue.length > 0) {
        const entry = queue.shift();
        if (entry.isFile) {
            // Reject on error so one unreadable entry cannot hang the drop forever.
            const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
            file.customPath = entry.fullPath.replace(/^\/+/, "");
            files.push(file);
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            // readEntries returns batches; an empty batch means the directory is done.
            let entries;
            do {
                entries = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
                queue.push(...entries);
            } while (entries.length > 0);
        }
    }
    return files;
}

function updateFileLabel() {
    const label = $("fileDropLabel");
    const commitMsg = $("commitMessage");

    if (selectedFiles.length === 0) {
        // label content below is fully static markup; the only interpolated
        // value in this function is selectedFiles.length, which is a number.
        label.innerHTML = `${ICON_UPLOAD}<span>Choose files or drag files/folders here</span>`;
        label.classList.remove("has-file");
        return;
    }

    label.innerHTML = `${ICON_FILE}<span>${selectedFiles.length} file(s) ready</span>`;
    label.classList.add("has-file");

    commitMsg.value = selectedFiles.length === 1 ? `Add ${selectedFiles[0].customPath}` : `Add ${selectedFiles.length} files`;
    localStorage.setItem(SK.commitMessage, commitMsg.value);
}

function initFileDrop() {
    const drop = $("fileDrop");
    const input = $("fileInput");

    input.addEventListener("change", () => {
        if (input.files.length > 0) {
            selectedFiles = Array.from(input.files).map(withCustomPath);
            updateFileLabel();
        }
    });

    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("dragover"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
    drop.addEventListener("drop", async e => {
        e.preventDefault();
        drop.classList.remove("dragover");
        try {
            selectedFiles = await getFilesFromDataTransfer(e.dataTransfer);
        } catch (err) {
            addLog("System", `Failed to read dropped items: ${err.message}`, "error");
            return;
        }
        updateFileLabel();
    });
}

function initCoauthorSearch() {
    $("coauthorSearch").addEventListener("input", e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll(".coauthor-item").forEach(item => {
            item.classList.toggle("filter-hidden", q && !item.dataset.login.includes(q));
        });
    });
}

async function commitMultipleFiles(owner, repo, token, filesData, message, branchName = null) {
    const headers = apiHeaders(token);
    const base = repoApiBase(owner, repo);

    let targetBranch = branchName;
    if (!targetBranch) {
        const repoInfo = await ghFetch(base, { headers }, "Cannot access repository");
        targetBranch = repoInfo.default_branch;
    }

    // Branch names come from the API itself or from slugify(), so they are
    // safe to interpolate raw; slashes in branch names must stay raw here.
    const refData = await ghFetch(`${base}/git/ref/heads/${targetBranch}`, { headers }, "Cannot read branch ref");
    const latestCommitSha = refData.object.sha;

    const commitData = await ghFetch(`${base}/git/commits/${latestCommitSha}`, { headers }, "Cannot read base commit");
    const baseTreeSha = commitData.tree.sha;

    // Blobs are independent of each other: create them in parallel instead of
    // paying one network round trip per file per repository.
    const tree = await Promise.all(filesData.map(async file => {
        const blob = await ghFetch(`${base}/git/blobs`, {
            method: "POST",
            headers,
            body: JSON.stringify({ content: file.content, encoding: "base64" })
        }, `Failed to create blob for ${file.path}`);
        return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
    }));

    const newTree = await ghFetch(`${base}/git/trees`, {
        method: "POST",
        headers,
        body: JSON.stringify({ base_tree: baseTreeSha, tree })
    }, "Failed to create tree structure");

    const newCommit = await ghFetch(`${base}/git/commits`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message, tree: newTree.sha, parents: [latestCommitSha] })
    }, "Failed to create commit");

    // force: false keeps the update strictly fast-forward, so a concurrent push
    // on the target branch can never be silently overwritten.
    await ghFetch(`${base}/git/refs/heads/${targetBranch}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ sha: newCommit.sha, force: false })
    }, "Failed to update branch reference");

    return { action: "committed", url: newCommit.html_url };
}

async function createPRMultipleFiles(owner, repo, token, filesData, commitMsg, prBranch, prTitle, prBody) {
    const headers = apiHeaders(token);
    const base = repoApiBase(owner, repo);

    const repoInfo = await ghFetch(base, { headers }, "Cannot access repository");
    const defaultBranch = repoInfo.default_branch;

    const refData = await ghFetch(`${base}/git/ref/heads/${defaultBranch}`, { headers }, "Cannot read default branch ref");
    const baseSha = refData.object.sha;

    // slugify() can legitimately produce an empty string; fall back to a
    // timestamped name so the ref is always valid.
    const branch = (prBranch ? slugify(prBranch) : "") || `deploy-${Date.now()}`;
    const createRefRes = await fetch(`${base}/git/refs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha })
    });
    if (!createRefRes.ok) {
        const err = await apiError(createRefRes, "Failed to create branch");
        // 422 "already exists" means a previous run left the branch behind or
        // the user re-ran with the same name: reuse it so repeated deploys are
        // idempotent instead of failing outright.
        if (!(createRefRes.status === 422 && /already exists/i.test(err.message))) {
            throw err;
        }
    }

    await commitMultipleFiles(owner, repo, token, filesData, commitMsg, branch);

    const pr = await ghFetch(`${base}/pulls`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            title: prTitle || commitMsg,
            body: prBody || "",
            head: branch,
            base: defaultBranch
        })
    }, "Failed to create PR");

    return { url: pr.html_url, number: pr.number };
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // readAsDataURL produces "data:<mime>;base64,<payload>"; strip the header.
            const result = String(reader.result || "");
            const comma = result.indexOf(",");
            if (comma === -1) {
                reject(new Error(`Could not encode file "${file.name}"`));
                return;
            }
            resolve(result.slice(comma + 1));
        };
        reader.onerror = () => reject(new Error(`Could not read file "${file.name}"`));
        reader.readAsDataURL(file);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    restore();
    buildCoauthorGrid();
    initFileDrop();
    initCoauthorSearch();
    PERSISTED_IDS.forEach(persist);

    document.querySelectorAll("#deployMethod .seg-btn").forEach(btn => {
        btn.addEventListener("click", () => setDeployMethod(btn.dataset.value));
    });

    $("uploadForm").addEventListener("submit", async e => {
        e.preventDefault();

        const token = $("apiToken").value.trim();
        const commitMessage = $("commitMessage").value.trim();
        const extendedDesc = $("extendedDescription").value.trim();
        const repoListText = $("repoList").value;
        const method = getDeployMethod();
        const statusLog = $("statusLog");
        const submitBtn = $("submitBtn");

        statusLog.textContent = "";

        if (selectedFiles.length === 0) {
            addLog("System", "Please select files or drag folders.", "error");
            return;
        }

        const repos = repoListText.split("\n").map(r => r.trim()).filter(Boolean);
        if (!repos.length) { addLog("System", "Repository list is empty.", "error"); return; }

        submitBtn.disabled = true;

        const progressTrack = document.createElement("div");
        progressTrack.className = "progress-bar-track";
        const progressFill = document.createElement("div");
        progressFill.className = "progress-bar-fill";
        progressTrack.appendChild(progressFill);
        statusLog.appendChild(progressTrack);

        try {
            // Read and encode every file once, then reuse for all repositories.
            let filesData = await Promise.all(selectedFiles.map(async file => ({
                path: sanitizeRepoPath(file.customPath || file.name),
                content: await readFileAsBase64(file)
            })));

            // Drop entries whose path became empty after sanitization, then
            // de-duplicate paths (last one wins) because the tree API rejects
            // duplicate entries.
            const skipped = filesData.length;
            filesData = [...new Map(filesData.filter(f => f.path).map(f => [f.path, f])).values()];
            if (filesData.length < skipped) {
                addLog("System", `Skipped ${skipped - filesData.length} file(s) with duplicate or unusable paths.`, "warn");
            }
            if (filesData.length === 0) {
                throw new Error("No usable files remain after path checks");
            }

            const msgParts = [commitMessage];
            if (extendedDesc) msgParts.push(extendedDesc);
            const coauthorLines = getCoauthorTrailers();
            if (coauthorLines.length) msgParts.push(coauthorLines.join("\n"));
            const fullMessage = msgParts.join("\n\n");

            const modeLabel = method === "pr" ? "pull requests" : "commits";
            addLog("System", `Deploying ${filesData.length} item(s) as ${modeLabel} to ${repos.length} repositor${repos.length === 1 ? "y" : "ies"}`, "info");

            // Read PR options once; they cannot change while the deploy runs.
            const prBranch = $("prBranch").value.trim();
            const prTitle = $("prTitle").value.trim();
            const prBody = $("prBody").value.trim();
            const seenRepos = new Set();

            for (let i = 0; i < repos.length; i++) {
                const parsed = parseRepo(repos[i]);
                if (!parsed) {
                    addLog(repos[i], "Invalid format (expected owner/repo)", "error");
                    updateProgress(i + 1, repos.length);
                    continue;
                }
                const name = `${parsed.owner}/${parsed.repo}`;

                // One deploy per repository, regardless of casing or duplicates.
                if (seenRepos.has(name.toLowerCase())) {
                    addLog(name, "Duplicate entry; skipped.", "warn");
                    updateProgress(i + 1, repos.length);
                    continue;
                }
                seenRepos.add(name.toLowerCase());

                try {
                    if (method === "pr") {
                        const result = await createPRMultipleFiles(parsed.owner, parsed.repo, token, filesData, fullMessage, prBranch, prTitle || commitMessage, prBody);
                        addLog(name, `PR #${result.number} created`, "success", { url: result.url, label: "view" });
                    } else {
                        const result = await commitMultipleFiles(parsed.owner, parsed.repo, token, filesData, fullMessage);
                        addLog(name, result.action, "success", { url: result.url, label: "view commit" });
                    }
                } catch (err) {
                    addLog(name, err.message, "error");
                }
                updateProgress(i + 1, repos.length);
            }
        } catch (error) {
            addLog("System", `Failed to process files: ${error.message}`, "error");
        }

        submitBtn.disabled = false;
        addLog("System", "Done.", "info");
    });
});
