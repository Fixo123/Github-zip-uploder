// ============================================================
// ⚡ Fast ZIP to GitHub Deployer - JavaScript Logic
// Developed by Fixo Dev
// ============================================================

(function() {
    // DOM refs
    const tokenInput = document.getElementById('token');
    const repoInput = document.getElementById('repo');
    const branchInput = document.getElementById('branch');
    const pathInput = document.getElementById('path');
    const commitPrefixInput = document.getElementById('commitPrefix');
    const zipInput = document.getElementById('zipInput');
    const deployBtn = document.getElementById('deployBtn');
    const logsDiv = document.getElementById('logs');
    const fileCounter = document.getElementById('fileCounter');
    const statusBadge = document.getElementById('statusBadge');
    const progressBar = document.getElementById('progressBar');
    const percentCounter = document.getElementById('percentCounter');
    const speedCounter = document.getElementById('speedCounter');
    const loader = document.getElementById('loader-overlay');

    // Global store for failed files (accessible by retry button)
    let failedFilesStore = [];
    let zipDataStore = null;
    let deployContext = {};

    // Hide loader
    window.addEventListener('load', () => setTimeout(() => loader.classList.add('hidden'), 800));

    // Logging
    function log(message, type = 'info') {
        const time = new Date().toLocaleTimeString();
        const span = document.createElement('span');
        span.textContent = `[${time}] ${message}`;
        span.className = type === 'success' ? 'log-success' : type === 'error' ? 'log-error' : type === 'warning' ?
            'log-warning' : type === 'skip' ? 'log-skip' : 'log-info';
        logsDiv.appendChild(span);
        logsDiv.appendChild(document.createElement('br'));
        logsDiv.scrollTop = logsDiv.scrollHeight;
    }

    function clearLogs() {
        logsDiv.innerHTML = '';
        const oldBox = document.getElementById('failedBoxContainer');
        if (oldBox) oldBox.remove();
    }

    function setStatus(text, state = 'idle') {
        statusBadge.textContent = text;
        statusBadge.className = 'badge';
        if (state === 'processing') {
            statusBadge.classList.add('processing');
            deployBtn.disabled = true;
            deployBtn.textContent = '⏳ Deploying Fast...';
        } else {
            deployBtn.disabled = false;
            deployBtn.textContent = '🚀 Deploy to GitHub (Fast)';
            if (state === 'success') statusBadge.classList.add('success');
            else if (state === 'error') statusBadge.classList.add('error');
        }
    }

    function updateProgress(current, total) {
        const percent = total === 0 ? 0 : Math.round((current / total) * 100);
        progressBar.style.width = percent + '%';
        percentCounter.textContent = percent + '%';
    }

    function updateSpeed(count, seconds) {
        if (seconds > 0) {
            const perMin = Math.round((count / seconds) * 60);
            speedCounter.textContent = `⚡ ${perMin} files/min`;
        }
    }

    // Fetch with timeout
    function fetchWithTimeout(url, options, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const controller = new AbortController();
            const timer = setTimeout(() => { controller.abort();
                reject(new Error('Request timed out')); }, timeout);
            fetch(url, { ...options, signal: controller.signal })
                .then(response => { clearTimeout(timer);
                    resolve(response); })
                .catch(err => { clearTimeout(timer);
                    reject(err); });
        });
    }

    // ===== SINGLE FILE UPLOAD =====
    async function uploadSingleFile(filename, zip, token, repo, branch, targetPath, commitPrefix) {
        let attempt = 0;
        const MAX_RETRIES = 3;
        while (attempt < MAX_RETRIES) {
            try {
                const fileData = zip.files[filename];
                const contentBase64 = await fileData.async('base64');

                let apiPath = filename;
                if (targetPath) {
                    const cleanTarget = targetPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
                    apiPath = `${cleanTarget}/${filename}`;
                }
                apiPath = apiPath.replace(/\/+/g, '/');
                const encodedPath = apiPath.split('/').map(encodeURIComponent).join('/');
                const url = `https://api.github.com/repos/${repo}/contents/${encodedPath}`;

                const response = await fetchWithTimeout(url, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    body: JSON.stringify({
                        message: `${commitPrefix} ${filename}`,
                        content: contentBase64,
                        branch: branch
                    })
                }, 30000);

                if (response.status === 201 || response.status === 200) {
                    return { filename, status: 'success' };
                } else if (response.status === 409) {
                    return { filename, status: 'skip' };
                } else {
                    let errorMsg = await response.text();
                    try { errorMsg = JSON.parse(errorMsg).message; } catch (e) {}
                    throw new Error(errorMsg);
                }
            } catch (err) {
                attempt++;
                if (attempt >= MAX_RETRIES) {
                    return { filename, status: 'failed', error: err.message };
                }
                await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
            }
        }
        return { filename, status: 'failed', error: 'Max retries exceeded' };
    }

    // ===== DISPLAY FAILED FILES BOX =====
    function renderFailedBox(failedFiles) {
        const oldBox = document.getElementById('failedBoxContainer');
        if (oldBox) oldBox.remove();

        if (failedFiles.length === 0) return;

        const box = document.createElement('div');
        box.id = 'failedBoxContainer';
        box.className = 'failed-box';

        const fileNames = failedFiles.map(f => f.name);

        // Copy function
        const copyFn = () => {
            navigator.clipboard.writeText(fileNames.join('\n')).then(() => {
                log('📋 Failed file names copied to clipboard!', 'success');
            }).catch(() => {
                const textarea = document.createElement('textarea');
                textarea.value = fileNames.join('\n');
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                log('📋 Failed file names copied!', 'success');
            });
        };

        // Retry function
        const retryFn = async () => {
            if (failedFiles.length === 0) return;
            log(`🔄 Retrying ${failedFiles.length} failed files...`, 'warning');
            const btn = document.querySelector('.retry-btn');
            if (btn) btn.disabled = true;

            let retrySuccess = 0,
                retryFail = 0;
            for (const f of failedFiles) {
                const result = await uploadSingleFile(
                    f.name,
                    zipDataStore,
                    deployContext.token,
                    deployContext.repo,
                    deployContext.branch,
                    deployContext.targetPath,
                    deployContext.commitPrefix
                );
                if (result.status === 'success') {
                    log(`✅ Retry Success: ${f.name}`, 'success');
                    retrySuccess++;
                } else {
                    log(`❌ Retry Failed: ${f.name} - ${result.error || 'Unknown'}`, 'error');
                    retryFail++;
                }
            }
            log(`🔄 Retry Complete: Success ${retrySuccess}, Failed ${retryFail}`, 'info');
            if (btn) btn.disabled = false;

            const b = document.getElementById('failedBoxContainer');
            if (b) b.remove();
            if (retryFail === 0) {
                log('🎉 All failed files retried successfully!', 'success');
            } else {
                log(`⚠️ ${retryFail} files still failed. Please check logs above.`, 'warning');
            }
        };

        box.innerHTML = `
            <div class="header-row">
                <span>❌ Failed Files (${failedFiles.length})</span>
                <div class="actions">
                    <button onclick="(${copyFn.toString()})()">📋 Copy Names</button>
                    <button class="retry-btn" onclick="(${retryFn.toString()})()">🔄 Retry All Failed</button>
                </div>
            </div>
            <ul>
                ${failedFiles.map(f => `<li>${f.name} <span class="err-msg">- ${f.error}</span></li>`).join('')}
            </ul>
        `;
        logsDiv.appendChild(box);
    }

    // ===== MAIN DEPLOY =====
    deployBtn.addEventListener('click', async () => {
        let token = tokenInput.value.trim();
        let repo = repoInput.value.trim();
        const branch = branchInput.value.trim() || 'main';
        const targetPath = pathInput.value.trim();
        const commitPrefix = commitPrefixInput.value.trim() || '🚀 Deploy: ';
        const zipFile = zipInput.files[0];

        if (repo.includes('github.com/')) {
            const parts = repo.split('github.com/');
            repo = parts[parts.length - 1].replace(/\.git$/, '').replace(/\/$/, '');
        }
        repo = repo.replace(/^\/+/, '');

        if (!token) { log('❌ Enter your GitHub Token.', 'error'); return; }
        if (!repo) { log('❌ Enter the repository.', 'error'); return; }
        if (!zipFile) { log('❌ Select a ZIP file.', 'error'); return; }
        if (!repo.includes('/')) { log('❌ Repository must be "owner/repo" format.', 'error'); return; }

        deployContext = { token, repo, branch, targetPath, commitPrefix };
        failedFilesStore = [];

        clearLogs();
        setStatus('Processing...', 'processing');
        updateProgress(0, 1);
        const startTime = Date.now();

        try {
            // Quick repo check
            log(`🔍 Checking repo: ${repo} ...`, 'info');
            const checkRes = await fetch(`https://api.github.com/repos/${repo}`, {
                headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (checkRes.status === 404) {
                log(`❌ REPO NOT FOUND. Create it first.`, 'error');
                setStatus('Repo Not Found', 'error');
                return;
            } else if (checkRes.status === 401 || checkRes.status === 403) {
                log(`❌ Token Error: Need "repo" scope.`, 'error');
                setStatus('Token Error', 'error');
                return;
            }
            log(`✅ Repository verified.`, 'success');

            const zip = await JSZip.loadAsync(zipFile);
            zipDataStore = zip;
            const allFiles = Object.keys(zip.files).filter(name => !zip.files[name].dir);
            if (allFiles.length === 0) { log('⚠️ ZIP is empty.', 'warning');
                setStatus('Empty ZIP', 'error'); return; }

            fileCounter.textContent = `📄 Files: ${allFiles.length}`;
            log(`✅ Found ${allFiles.length} files. Starting parallel upload (5 at a time)...`, 'success');

            let successCount = 0,
                skipCount = 0,
                failCount = 0;
            const totalFiles = allFiles.length;
            const CONCURRENCY = 5;
            let processedCount = 0;
            let lastLoggedProgress = 0;
            const failedFiles = [];

            for (let i = 0; i < totalFiles; i += CONCURRENCY) {
                const batch = allFiles.slice(i, i + CONCURRENCY);
                const batchPromises = batch.map(file => uploadSingleFile(
                    file, zip, token, repo, branch, targetPath, commitPrefix
                ));
                const results = await Promise.all(batchPromises);

                for (const res of results) {
                    processedCount++;
                    if (res.status === 'success') {
                        log(`✅ (${processedCount}/${totalFiles}) ${res.filename}`, 'success');
                        successCount++;
                    } else if (res.status === 'skip') {
                        log(`⏭️ (${processedCount}/${totalFiles}) ${res.filename} (exists, skipped)`, 'skip');
                        skipCount++;
                    } else {
                        log(`❌ (${processedCount}/${totalFiles}) ${res.filename} - ${res.error}`, 'error');
                        failCount++;
                        failedFiles.push({ name: res.filename, error: res.error });
                    }
                }

                updateProgress(processedCount, totalFiles);
                const elapsed = (Date.now() - startTime) / 1000;
                updateSpeed(processedCount, elapsed);

                if (processedCount - lastLoggedProgress >= 20 || processedCount === totalFiles) {
                    log(`📊 Progress: ${processedCount}/${totalFiles} files.`, 'info');
                    lastLoggedProgress = processedCount;
                }
            }

            failedFilesStore = failedFiles;

            const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(1);
            log(`\n🏁 Deployment Complete! (${elapsedTotal}s)`, 'info');
            log(`✅ Success: ${successCount}`, 'success');
            if (skipCount > 0) log(`⏭️ Skipped (already existed): ${skipCount}`, 'skip');
            if (failCount > 0) log(`❌ Failed: ${failCount}`, 'error');

            if (failedFiles.length > 0) {
                renderFailedBox(failedFiles);
            }

            if (failCount === 0 && successCount + skipCount > 0) {
                setStatus(`✅ Done (${successCount} uploaded, ${skipCount} skipped)`, 'success');
                log(`🎉 Fast deploy completed successfully!`, 'success');
            } else if (successCount > 0) {
                setStatus(`⚠️ Partial (${successCount}/${totalFiles})`, 'error');
            } else {
                setStatus('❌ Failed', 'error');
            }

        } catch (error) {
            console.error(error);
            log(`🔥 Critical Error: ${error.message}`, 'error');
            setStatus('❌ System Error', 'error');
        }
    });

    zipInput.addEventListener('change', function() {
        if (this.files.length > 0) log(`📎 Selected: ${this.files[0].name}`, 'info');
    });

    log('🟢 Fast Deployer Ready. Failed files will be listed with Retry option!', 'info');
    setStatus('⏳ Idle', 'idle');
})();
