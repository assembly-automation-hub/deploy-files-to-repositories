// Known GitHub bot identities used for Co-authored-by trailers.
// The id is the numeric part of the "<id>+<login>@users.noreply.github.com"
// noreply address; GitHub resolves the account primarily by this id, so an
// incorrect id links the co-author to the wrong account (or to nobody).
// Logins and ids below were verified against the GitHub API (GET /users/{login})
// on 2026-10-17. Entries marked "legacy" no longer resolve as users; they are
// kept so the dropdown stays compatible with older saved selections.
const KNOWN_BOTS = [
    { login: "github-actions[bot]", id: 41898282 },
    { login: "dependabot[bot]", id: 49699333 },
    { login: "github-advanced-security[bot]", id: 62310815 },
    { login: "copilot[bot]", id: 167198135 },
    { login: "renovate[bot]", id: 29139614 },
    { login: "codecov[bot]", id: 22429695 },
    { login: "snyk-bot", id: 19733683 },
    { login: "imgbot[bot]", id: 31301654 },
    { login: "allcontributors[bot]", id: 46447321 },
    { login: "greenkeeper[bot]", id: 23040076 },
    // Legacy: whitesource-bolt-for-github[bot] was renamed to mend-bolt-for-github[bot].
    { login: "whitesource-bolt-for-github[bot]", id: 42627940 },
    { login: "stale[bot]", id: 26384082 },
    { login: "pull[bot]", id: 39814207 },
    { login: "lgtm-com[bot]", id: 43144390 },
    // SonarCloud was renamed to SonarQube Cloud; the old value pointed at mergify's id.
    { login: "sonarqubecloud[bot]", id: 39514782 },
    { login: "vercel[bot]", id: 35613825 },
    { login: "netlify[bot]", id: 40209326 },
    { login: "release-drafter[bot]", id: 40829082 },
    { login: "semantic-release-bot", id: 32174276 },
    { login: "deepsource-autofix[bot]", id: 62050782 },
    { login: "coderabbitai[bot]", id: 136622811 },
    { login: "mergify[bot]", id: 37929162 },
    { login: "pre-commit-ci[bot]", id: 66853113 },
    { login: "fossabot", id: 29791463 },
    { login: "pyup-bot", id: 16239342 },
    { login: "depfu[bot]", id: 23717796 },
    { login: "welcome[bot]", id: 30606887 },
    { login: "gitlocalize-app[bot]", id: 55277160 },
    // Legacy: CodeSee shut down; the user no longer resolves.
    { login: "codesee-architecture-diagrams[bot]", id: 70554494 },
    { login: "socket-security[bot]", id: 95510084 },
    { login: "github-pages[bot]", id: 52472962 },
    { login: "codecov-commenter", id: 65553080 },
    { login: "gitpod-io[bot]", id: 46564150 },
    { login: "codefactor-io[bot]", id: 47775046 },
    // Legacy: codacy-badger[bot] no longer resolves as a user.
    { login: "codacy-badger[bot]", id: 29936930 },
    { login: "snyk-io[bot]", id: 141718529 },
    { login: "mend-bolt-for-github[bot]", id: 42819689 },
    { login: "crowdin-bot", id: 58779643 },
    { login: "transifex-integration[bot]", id: 43880903 },
    // Legacy: weblate[bot] no longer resolves as a user.
    { login: "weblate[bot]", id: 37346163 },
    { login: "azure-pipelines[bot]", id: 36771401 },
    { login: "restyled-io[bot]", id: 32688539 },
    { login: "kodiakhq[bot]", id: 49736102 },
    { login: "boring-cyborg[bot]", id: 59518230 },
    { login: "todo[bot]", id: 32347756 },
    { login: "github-learning-lab[bot]", id: 37936606 },
    { login: "sentry[bot]", id: 39604003 },
    { login: "step-security-bot", id: 89328645 },
    { login: "autofix-ci[bot]", id: 114827586 },
    // Legacy: sweep-ai[bot] no longer resolves as a user.
    { login: "sweep-ai[bot]", id: 127925430 },
    { login: "sourcery-ai[bot]", id: 58596630 },
    { login: "deepsource-io[bot]", id: 42547082 },
    // id 0: no resolvable noreply identity; the trailer is kept as plain text.
    { login: "typesync-bot", id: 0 },
    { login: "gitleaks[bot]", id: 54865149 },
    { login: "changeset-bot[bot]", id: 49419645 }
];

export default KNOWN_BOTS;
