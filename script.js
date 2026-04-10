import KNOWN_BOTS from "./bots.js";

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

function $(id) { return document.getElementById(id); }

function restore() {
    ["repoList", "apiToken", "commitMessage", "extendedDescription", "prBranch", "prTitle", "prBody"].forEach(id => {
        const v = localStorage.getItem(SK[id]);
        if (v !== null && $(id)) $(id).value = v;
    });
    const method = localStorage.getItem(SK.deployMethod) || "commit";
    setDeployMethod(method);
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
    try { saved = JSON.parse(localStorage.getItem(SK.selectedBots) || "[]"); } catch {}

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
        avatar.src = `https://github.com/${bot.login.replace("[bot]", "%5Bbot%5D")}.png?size=40`;
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

function addLog(target, message, type) {
    const log = $("statusLog");
    const entry = document.createElement("div");
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<strong>${target}:</strong> <span>${message}</span>`;
    log.appendChild(entry);
    entry.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateProgress(current, total) {
    const fill = document.querySelector(".progress-bar-fill");
    if (fill) fill.style.width = `${(current / total) * 100}%`;
}

function parseRepo(raw) {
    let clean = raw.replace(/^(https?:\/\/)?(github\.com\/)?/, "").replace(/\/$/, "");
    const parts = clean.split("/");
    if (parts.length < 2) return null;
    return { owner: parts[parts.length - 2], repo: parts[parts.length - 1] };
}

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function apiHeaders(token) {
    return {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    };
}

async function directCommit(owner, repo, token, base64Content, fileName, fullMessage) {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(fileName)}`;
    const headers = apiHeaders(token);

    let sha = null;
    const getRes = await fetch(apiUrl, { method: "GET", headers });
    if (getRes.ok) {
        sha = (await getRes.json()).sha;
    } else if (getRes.status !== 404) {
        throw new Error((await getRes.json()).message || "Failed to check file");
    }

    const body = { message: fullMessage, content: base64Content };
    if (sha) body.sha = sha;

    const putRes = await fetch(apiUrl, { method: "PUT", headers, body: JSON.stringify(body) });
    if (!putRes.ok) throw new Error((await putRes.json()).message || "Failed to write");

    const data = await putRes.json();
    return { action: sha ? "updated" : "created", url: data.commit.html_url };
}

async function createPR(owner, repo, token, base64Content, fileName, commitMsg, prBranch, prTitle, prBody) {
    const headers = apiHeaders(token);
    const base = `https://api.github.com/repos/${owner}/${repo}`;

    const repoRes = await fetch(base, { headers });
    if (!repoRes.ok) throw new Error((await repoRes.json()).message || "Cannot access repo");
    const repoData = await repoRes.json();
    const defaultBranch = repoData.default_branch;

    const refRes = await fetch(`${base}/git/ref/heads/${defaultBranch}`, { headers });
    if (!refRes.ok) throw new Error("Cannot read default branch ref");
    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    const branch = prBranch || `add-${slugify(fileName)}-${Date.now()}`;

    const createRefRes = await fetch(`${base}/git/refs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha })
    });
    if (!createRefRes.ok) {
        const err = await createRefRes.json();
        throw new Error(err.message || "Failed to create branch");
    }

    const contentsUrl = `${base}/contents/${encodeURIComponent(fileName)}`;
    let sha = null;
    const checkRes = await fetch(`${contentsUrl}?ref=${branch}`, { headers });
    if (checkRes.ok) sha = (await checkRes.json()).sha;

    const putBody = { message: commitMsg, content: base64Content, branch };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(contentsUrl, { method: "PUT", headers, body: JSON.stringify(putBody) });
    if (!putRes.ok) throw new Error((await putRes.json()).message || "Failed to commit to branch");

    const prRes = await fetch(`${base}/pulls`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            title: prTitle || commitMsg,
            body: prBody || "",
            head: branch,
            base: defaultBranch
        })
    });

    if (!prRes.ok) throw new Error((await prRes.json()).message || "Failed to create PR");

    const prData = await prRes.json();
    return { url: prData.html_url, number: prData.number };
}

function initFileDrop() {
    const drop = $("fileDrop");
    const input = $("fileInput");
    const label = $("fileDropLabel");
    const commitMsg = $("commitMessage");

    function showFile(file) {
        label.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/></svg><span>${file.name}</span>`;
        label.classList.add("has-file");
        commitMsg.value = `Add ${file.name}`;
        localStorage.setItem(SK.commitMessage, commitMsg.value);
    }

    input.addEventListener("change", () => { if (input.files[0]) showFile(input.files[0]); });

    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("dragover"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
    drop.addEventListener("drop", e => {
        e.preventDefault();
        drop.classList.remove("dragover");
        if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            showFile(e.dataTransfer.files[0]);
        }
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

document.addEventListener("DOMContentLoaded", () => {
    restore();
    buildCoauthorGrid();
    initFileDrop();
    initCoauthorSearch();
    ["repoList", "apiToken", "commitMessage", "extendedDescription", "prBranch", "prTitle", "prBody"].forEach(persist);

    document.querySelectorAll("#deployMethod .seg-btn").forEach(btn => {
        btn.addEventListener("click", () => setDeployMethod(btn.dataset.value));
    });

    $("uploadForm").addEventListener("submit", async e => {
        e.preventDefault();

        const token = $("apiToken").value.trim();
        const fileInput = $("fileInput").files[0];
        const commitMessage = $("commitMessage").value.trim();
        const extendedDesc = $("extendedDescription").value.trim();
        const repoListText = $("repoList").value;
        const method = getDeployMethod();
        const statusLog = $("statusLog");
        const submitBtn = $("submitBtn");

        statusLog.innerHTML = "";

        if (!fileInput) { addLog("System", "Please select a file.", "error"); return; }

        const repos = repoListText.split("\n").map(r => r.trim()).filter(Boolean);
        if (!repos.length) { addLog("System", "Repository list is empty.", "error"); return; }

        submitBtn.disabled = true;

        const progressTrack = document.createElement("div");
        progressTrack.className = "progress-bar-track";
        progressTrack.innerHTML = '<div class="progress-bar-fill"></div>';
        statusLog.appendChild(progressTrack);

        const reader = new FileReader();
        reader.onload = async event => {
            const content = event.target.result;
            const base64Content = btoa(unescape(encodeURIComponent(content)));
            const fileName = fileInput.name;

            let msgParts = [commitMessage];
            if (extendedDesc) msgParts.push(extendedDesc);
            const coauthorLines = getCoauthorTrailers();
            if (coauthorLines.length) msgParts.push(coauthorLines.join("\n"));
            const fullMessage = msgParts.join("\n\n");

            const modeLabel = method === "pr" ? "pull requests" : "commits";
            addLog("System", `Deploying <strong>${fileName}</strong> as ${modeLabel} to ${repos.length} repositor${repos.length === 1 ? "y" : "ies"}`, "info");

            for (let i = 0; i < repos.length; i++) {
                const parsed = parseRepo(repos[i]);
                if (!parsed) {
                    addLog(repos[i], "Invalid format (expected owner/repo)", "error");
                    updateProgress(i + 1, repos.length);
                    continue;
                }
                const name = `${parsed.owner}/${parsed.repo}`;
                try {
                    if (method === "pr") {
                        const prBranch = $("prBranch").value.trim();
                        const prTitle = $("prTitle").value.trim();
                        const prBody = $("prBody").value.trim();
                        const result = await createPR(parsed.owner, parsed.repo, token, base64Content, fileName, fullMessage, prBranch, prTitle || commitMessage, prBody);
                        addLog(name, `PR #${result.number} created &mdash; <a href="${result.url}" target="_blank" rel="noopener">view</a>`, "success");
                    } else {
                        const result = await directCommit(parsed.owner, parsed.repo, token, base64Content, fileName, fullMessage);
                        addLog(name, `${result.action} &mdash; <a href="${result.url}" target="_blank" rel="noopener">view commit</a>`, "success");
                    }
                } catch (err) {
                    addLog(name, err.message, "error");
                }
                updateProgress(i + 1, repos.length);
            }

            submitBtn.disabled = false;
            addLog("System", "Done.", "info");
        };

        reader.readAsText(fileInput);
    });
});
