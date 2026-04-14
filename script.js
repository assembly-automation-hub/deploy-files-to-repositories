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

let selectedFiles = [];

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

function apiHeaders(token) {
    return {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    };
}

async function getFilesFromDataTransfer(items) {
    const files = [];
    const queue = [];
    for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
            const entry = items[i].webkitGetAsEntry();
            if (entry) queue.push(entry);
        }
    }

    while (queue.length > 0) {
        const entry = queue.shift();
        if (entry.isFile) {
            const file = await new Promise(res => entry.file(res));
            file.customPath = entry.fullPath.replace(/^\//, '');
            files.push(file);
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            let hasMore = true;
            while (hasMore) {
                const entries = await new Promise(res => reader.readEntries(res));
                if (entries.length > 0) {
                    queue.push(...entries);
                } else {
                    hasMore = false;
                }
            }
        }
    }
    return files;
}

function updateFileLabel() {
    const label = $("fileDropLabel");
    const commitMsg = $("commitMessage");
    
    if (selectedFiles.length === 0) {
        label.innerHTML = `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14ZM11.28 4.72a.749.749 0 1 1-1.06 1.06L8.75 4.31v6.94a.75.75 0 0 1-1.5 0V4.31L5.78 5.78a.749.749 0 1 1-1.06-1.06l3-3a.75.75 0 0 1 1.06 0Z"/></svg><span>Choose files or drag files/folders here</span>`;
        label.classList.remove("has-file");
        return;
    }

    label.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/></svg><span>${selectedFiles.length} file(s) ready</span>`;
    label.classList.add("has-file");
    
    commitMsg.value = selectedFiles.length === 1 ? `Add ${selectedFiles[0].customPath}` : `Add ${selectedFiles.length} files`;
    localStorage.setItem(SK.commitMessage, commitMsg.value);
}

function initFileDrop() {
    const drop = $("fileDrop");
    const input = $("fileInput");

    input.addEventListener("change", () => {
        if (input.files.length > 0) {
            selectedFiles = Array.from(input.files).map(f => {
                f.customPath = f.webkitRelativePath || f.name;
                return f;
            });
            updateFileLabel();
        }
    });

    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("dragover"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
    drop.addEventListener("drop", async e => {
        e.preventDefault();
        drop.classList.remove("dragover");
        if (e.dataTransfer.items) {
            selectedFiles = await getFilesFromDataTransfer(e.dataTransfer.items);
        } else if (e.dataTransfer.files) {
            selectedFiles = Array.from(e.dataTransfer.files).map(f => {
                f.customPath = f.webkitRelativePath || f.name;
                return f;
            });
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
    const base = `https://api.github.com/repos/${owner}/${repo}`;

    let targetBranch = branchName;
    if (!targetBranch) {
        const repoRes = await fetch(base, { headers });
        if (!repoRes.ok) throw new Error((await repoRes.json()).message || "Cannot access repo");
        targetBranch = (await repoRes.json()).default_branch;
    }

    const refRes = await fetch(`${base}/git/ref/heads/${targetBranch}`, { headers });
    if (!refRes.ok) throw new Error("Cannot read branch ref");
    const latestCommitSha = (await refRes.json()).object.sha;

    const commitRes = await fetch(`${base}/git/commits/${latestCommitSha}`, { headers });
    const baseTreeSha = (await commitRes.json()).tree.sha;

    const tree = [];
    for (const file of filesData) {
        const blobRes = await fetch(`${base}/git/blobs`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ content: file.content, encoding: 'base64' })
        });
        if (!blobRes.ok) throw new Error("Failed to create blob for " + file.path);
        
        tree.push({
            path: file.path,
            mode: '100644',
            type: 'blob',
            sha: (await blobRes.json()).sha
        });
    }

    const createTreeRes = await fetch(`${base}/git/trees`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ base_tree: baseTreeSha, tree })
    });
    if (!createTreeRes.ok) throw new Error("Failed to create tree structure");
    const newTreeData = await createTreeRes.json();

    const createCommitRes = await fetch(`${base}/git/commits`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            message: message,
            tree: newTreeData.sha,
            parents: [latestCommitSha]
        })
    });
    if (!createCommitRes.ok) throw new Error("Failed to create commit");
    const newCommitData = await createCommitRes.json();

    const updateRefRes = await fetch(`${base}/git/refs/heads/${targetBranch}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha: newCommitData.sha })
    });
    if (!updateRefRes.ok) throw new Error("Failed to update branch reference");

    return { action: "committed", url: newCommitData.html_url };
}

async function createPRMultipleFiles(owner, repo, token, filesData, commitMsg, prBranch, prTitle, prBody) {
    const headers = apiHeaders(token);
    const base = `https://api.github.com/repos/${owner}/${repo}`;

    const repoRes = await fetch(base, { headers });
    if (!repoRes.ok) throw new Error((await repoRes.json()).message || "Cannot access repo");
    const defaultBranch = (await repoRes.json()).default_branch;

    const refRes = await fetch(`${base}/git/ref/heads/${defaultBranch}`, { headers });
    if (!refRes.ok) throw new Error("Cannot read default branch ref");
    const baseSha = (await refRes.json()).object.sha;

    const branch = prBranch || `deploy-${Date.now()}`;
    const createRefRes = await fetch(`${base}/git/refs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha })
    });
    if (!createRefRes.ok) {
        throw new Error((await createRefRes.json()).message || "Failed to create branch");
    }

    await commitMultipleFiles(owner, repo, token, filesData, commitMsg, branch);

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
        const commitMessage = $("commitMessage").value.trim();
        const extendedDesc = $("extendedDescription").value.trim();
        const repoListText = $("repoList").value;
        const method = getDeployMethod();
        const statusLog = $("statusLog");
        const submitBtn = $("submitBtn");

        statusLog.innerHTML = "";

        if (selectedFiles.length === 0) {
            addLog("System", "Please select files or drag folders.", "error");
            return;
        }

        const repos = repoListText.split("\n").map(r => r.trim()).filter(Boolean);
        if (!repos.length) { addLog("System", "Repository list is empty.", "error"); return; }

        submitBtn.disabled = true;

        const progressTrack = document.createElement("div");
        progressTrack.className = "progress-bar-track";
        progressTrack.innerHTML = '<div class="progress-bar-fill"></div>';
        statusLog.appendChild(progressTrack);

        try {
            const filesData = await Promise.all(selectedFiles.map(async f => {
                const b64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = event => {
                        const base64 = event.target.result.split(',')[1];
                        resolve(base64);
                    };
                    reader.readAsDataURL(f);
                });
                return { path: f.customPath || f.name, content: b64 };
            }));

            let msgParts = [commitMessage];
            if (extendedDesc) msgParts.push(extendedDesc);
            const coauthorLines = getCoauthorTrailers();
            if (coauthorLines.length) msgParts.push(coauthorLines.join("\n"));
            const fullMessage = msgParts.join("\n\n");

            const modeLabel = method === "pr" ? "pull requests" : "commits";
            addLog("System", `Deploying ${filesData.length} item(s) as ${modeLabel} to ${repos.length} repositor${repos.length === 1 ? "y" : "ies"}`, "info");

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
                        const result = await createPRMultipleFiles(parsed.owner, parsed.repo, token, filesData, fullMessage, prBranch, prTitle || commitMessage, prBody);
                        addLog(name, `PR #${result.number} created &mdash; <a href="${result.url}" target="_blank" rel="noopener">view</a>`, "success");
                    } else {
                        const result = await commitMultipleFiles(parsed.owner, parsed.repo, token, filesData, fullMessage);
                        addLog(name, `${result.action} &mdash; <a href="${result.url}" target="_blank" rel="noopener">view commit</a>`, "success");
                    }
                } catch (err) {
                    addLog(name, err.message, "error");
                }
                updateProgress(i + 1, repos.length);
            }
        } catch (error) {
            addLog("System", "Failed to process files: " + error.message, "error");
        }

        submitBtn.disabled = false;
        addLog("System", "Done.", "info");
    });
});
