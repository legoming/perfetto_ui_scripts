// ==UserScript==
// @name         Perfetto UI Auto Pin Threads
// @namespace    http://tampermonkey.net/
// @version      1.23
// @description  在 Perfetto UI 中自动批量 pin 住 SurfaceFlinger 和 App 的关键渲染线程（支持多进程）
// @author       Jet (Cloudrise)
// @match        https://ui.perfetto.dev/*
// @match        https://*.perfetto.dev/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 延迟创建悬浮按钮，并添加持久化机制
    setTimeout(() => {
        createFloatingButton();
        startButtonMonitor();
    }, 1000);

    // 监控按钮是否存在，如果被移除则重新创建
    function startButtonMonitor() {
        // 使用 MutationObserver 监听 DOM 变化
        const observer = new MutationObserver(() => {
            ensureButtonExists();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 定期检查按钮是否存在
        setInterval(ensureButtonExists, 2000);
    }

    // 确保按钮存在
    function ensureButtonExists() {
        const existingButton = document.getElementById('perfetto-auto-pin-btn');
        if (!existingButton) {
            console.log('🔄 检测到按钮被移除，重新创建...');
            createFloatingButton();
        }
    }

    // 创建悬浮按钮（黑底白字圆形，位于原按钮上方）
    function createFloatingButton() {
        // 先检查是否已存在，避免重复创建
        if (document.getElementById('perfetto-auto-pin-btn')) {
            return;
        }

        const button = document.createElement('button');
        button.id = 'perfetto-auto-pin-btn';
        button.innerHTML = '📌';

        // 位于右下角，但在原按钮上方（bottom: 90px 避免重叠）
        button.style.cssText = `
            position: fixed;
            bottom: 90px;
            right: 30px;
            z-index: 99999;
            width: 56px;
            height: 56px;
            padding: 0;
            background: #1a1a1a;
            background: rgba(26, 26, 26, 0.5);
            color: white;
            border: none;
            border-radius: 50%;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 0 rgba(26, 26, 26, 0.5);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
        `;

        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.1)';
            button.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4), 0 0 0 4px rgba(26, 26, 26, 0.1)';
            button.style.background = '#2a2a2a';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 0 0 rgba(26, 26, 26, 0.5)';
            button.style.background = 'rgba(26, 26, 26, 0.5)';
        });

        button.addEventListener('mousedown', () => {
            button.style.transform = 'scale(0.95)';
        });

        button.addEventListener('mouseup', () => {
            button.style.transform = 'scale(1.1)';
        });

        button.addEventListener('click', () => {
            showInputDialog();
        });

        document.body.appendChild(button);
        console.log('✅ Perfetto Auto Pin 按钮已创建（位于原按钮上方）');
    }

    // 创建输入对话框
    function showInputDialog() {
        const dialog = document.createElement('div');
        dialog.id = 'perfetto-input-dialog';
        dialog.innerHTML = `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 100001;
                background: white;
                padding: 30px;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                min-width: 400px;
            ">
                <h3 style="margin: 0 0 20px 0; color: #333; font-size: 18px;">
                    🎯 输入进程信息
                </h3>
                <input
                    type="text"
                    id="perfetto-app-input"
                    placeholder="输入 PID 或 Package Name，支持多个（例: 12345;3456;sf:223;ss:7867）"
                    style="
                        width: 100%;
                        padding: 12px;
                        border: 2px solid #e0e0e0;
                        border-radius: 6px;
                        font-size: 14px;
                        box-sizing: border-box;
                        margin-bottom: 10px;
                    "
                />
                <div style="color: #666; font-size: 12px; margin-bottom: 20px; line-height: 1.5;">
                    提示：无前缀为 app，sf: 为 surfaceflinger，ss: 为 system_server<br/>
                    例如：12345;3456;sf:223;ss:7867
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="perfetto-cancel-btn" style="
                        padding: 10px 20px;
                        background: #f0f0f0;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                    ">取消</button>
                    <button id="perfetto-confirm-btn" style="
                        padding: 10px 20px;
                        background: #1a1a1a;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: bold;
                    ">开始 Pin</button>
                </div>
            </div>
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 100000;
            "></div>
        `;

        document.body.appendChild(dialog);

        const input = document.getElementById('perfetto-app-input');
        const confirmBtn = document.getElementById('perfetto-confirm-btn');
        const cancelBtn = document.getElementById('perfetto-cancel-btn');

        input.focus();

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                confirmBtn.click();
            }
        });

        confirmBtn.addEventListener('click', () => {
            const inputValue = input.value.trim();
            if (inputValue) {
                dialog.remove();
                autoPinTracks(inputValue);
            } else {
                alert('⚠️ 请输入进程信息');
            }
        });

        cancelBtn.addEventListener('click', () => {
            dialog.remove();
        });
    }

    // 解析输入的进程信息
    function parseProcessInput(input) {
        const processes = {
            apps: [],
            surfaceflinger: null,
            system_server: null
        };

        const parts = input.split(';').map(p => p.trim()).filter(p => p);

        for (const part of parts) {
            if (part.toLowerCase().startsWith('sf:')) {
                processes.surfaceflinger = part.substring(3);
            } else if (part.toLowerCase().startsWith('ss:')) {
                processes.system_server = part.substring(3);
            } else {
                processes.apps.push(part);
            }
        }

        return processes;
    }

    // 核心 Pin 功能（支持多进程）
    async function autoPinTracks(inputString) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔍 开始自动 Pin 线程`);
        console.log(`📱 输入: ${inputString}`);
        console.log(`${'='.repeat(60)}\n`);

        const processes = parseProcessInput(inputString);
        console.log('解析结果:', processes);

        const sfIdentifier = processes.surfaceflinger || "surfaceflinger";
        const ssIdentifier = processes.system_server || "system_server";

        // 提取所有 app 的完整包名
        const appPackageNames = [];
        for (const appId of processes.apps) {
            const appProcessTrack = findProcessTrack(appId);
            let packageName = appId;
            let hasPackageName = false;
            if (appProcessTrack) {
                const titleEl = appProcessTrack.querySelector('.pf-track__title-popup');
                if (titleEl) {
                    const fullProcessName = titleEl.textContent || '';
                    const match = fullProcessName.match(/([\w.]+)\s+\d+/);
                    if (match) {
                        packageName = match[1];
                        hasPackageName = true;
                        console.log(`✨ App ${appId} 完整包名: ${packageName}\n`);
                    }
                }
            }
            appPackageNames.push({ id: appId, packageName: packageName, hasPackageName: hasPackageName });
        }

        let pinnedCount = 0;
        let notFoundTracks = [];
        const processCache = new Map();

        // 第一阶段：Pin 所有 app 相关的线程
        for (let appIndex = 0; appIndex < appPackageNames.length; appIndex++) {
            const { id: appIdentifier, packageName: appPackageName, hasPackageName } = appPackageNames[appIndex];

            console.log(`\n${'='.repeat(60)}`);
            console.log(`📱 处理 App ${appIndex + 1}/${appPackageNames.length}: ${appIdentifier}`);
            console.log(`${'='.repeat(60)}\n`);

            const appTrackPatterns = [
                { process: ssIdentifier, thread: "InputDispatcher", desc: "input dispatcher", pinAll: true},
                { process: sfIdentifier, thread: "VSYNC-app", desc: `[App ${appIndex + 1}] surfaceflinger / VSYNC-app` },
                { process: appIdentifier, thread: "Expected Timeline", desc: `[App ${appIndex + 1}] app / Expected Timeline` },
                { process: appIdentifier, thread: "Actual Timeline", desc: `[App ${appIndex + 1}] app / Actual Timeline` },
                { process: appIdentifier, thread: "aq:pending", desc: `[App ${appIndex + 1}] app / aq` },
                { process: appIdentifier, thread: "deliverInputEvent", desc: `[App ${appIndex + 1}] app / deliverInputEvent` },
                { process: appIdentifier, thread: "main", desc: `[App ${appIndex + 1}] app / main thread`, useChip: true, pinAll: true },
                { process: appIdentifier, thread: "RenderThread", desc: `[App ${appIndex + 1}] app / RenderThread`, pinAll: true, maxCount: 2 },
                { process: appIdentifier, thread: "GPU completion", desc: `[App ${appIndex + 1}] app / GPU completion`, pinAll: true },
                { process: appIdentifier, thread: "BLAST Consumer", desc: `[App ${appIndex + 1}] app / BLAST Consumer`, pinAll: true },
                { process: appIdentifier, thread: "QueuedBuffer", desc: `[App ${appIndex + 1}] app / QueuedBuffer`, pinAll: true },
            ];
            if (hasPackageName) {
                // 如果有 package name，只 pin 匹配的 BufferTX
                appTrackPatterns.push({
                    process: sfIdentifier,
                    thread: "BufferTX",
                    desc: `[App ${appIndex + 1}] surfaceflinger / BufferTX`,
                    partial: true,
                    matchAppName: appPackageName,
                    pinAll: true
                });
            } else {
                // 如果只有 PID，pin 所有 BufferTX
                appTrackPatterns.push({
                    process: sfIdentifier,
                    thread: "BufferTX",
                    desc: `[App ${appIndex + 1}] surfaceflinger / BufferTX (所有)`,
                    partial: true,
                    pinAll: true
                });
            }

            const result = await pinTracksByPatterns(appTrackPatterns, processCache);
            pinnedCount += result.pinnedCount;
            notFoundTracks.push(...result.notFoundTracks);
        }

        // 第二阶段：Pin surfaceflinger 和 system_server 相关的线程
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔧 处理 SurfaceFlinger 和 System Server`);
        console.log(`${'='.repeat(60)}\n`);

        const systemTrackPatterns = [
            { process: sfIdentifier, thread: "VSYNC-sf", desc: "surfaceflinger / VSYNC-sf" },
            { process: sfIdentifier, thread: "Expected Timeline", desc: "surfaceflinger / Expected Timeline" },
            { process: sfIdentifier, thread: "Actual Timeline", desc: "surfaceflinger / Actual Timeline" },
            { process: sfIdentifier, thread: "main", desc: "surfaceflinger / main thread", useChip: true, pinAll: true },
            { process: sfIdentifier, thread: "GPU completion", desc: "surfaceflinger / GPU completion", useChip: true, pinAll: true },
            { process: sfIdentifier, thread: "hasClientComposition", desc: "surfaceflinger / hasClientComposition", useChip: true, pinAll: true },
            { process: sfIdentifier, thread: "RenderEngine", desc: "surfaceflinger / RenderEngine", useChip: true, pinAll: true },
            { process: sfIdentifier, thread: "RE Completion", desc: "surfaceflinger / RE Completion", useChip: true, pinAll: true },
            { process: sfIdentifier, thread: "FramebufferSurface", desc: "surfaceflinger / FramebufferSurface" },
            { process: ssIdentifier, thread: "Focused app", desc: "focused app"}
        ];

        const systemResult = await pinTracksByPatterns(systemTrackPatterns, processCache);
        pinnedCount += systemResult.pinnedCount;
        notFoundTracks.push(...systemResult.notFoundTracks);

        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 执行完成`);
        console.log(`✅ 成功 pin: ${pinnedCount} 个 track`);
        console.log(`❌ 失败: ${notFoundTracks.length} 个模式`);
        if (notFoundTracks.length > 0) {
            console.log(`\n未能 pin 的 tracks:`);
            notFoundTracks.forEach(track => console.log(`  - ${track}`));
        }
        console.log(`${'='.repeat(60)}\n`);

        showResultNotification(pinnedCount, notFoundTracks.length);
    }

    // 按模式批量 pin tracks
    async function pinTracksByPatterns(trackPatterns, processCache) {
        let pinnedCount = 0;
        let notFoundTracks = [];

        for (let i = 0; i < trackPatterns.length; i++) {
            const pattern = trackPatterns[i];
            console.log(`\n📍 [${i + 1}/${trackPatterns.length}] ${pattern.desc}`);

            let processTrack = processCache.get(pattern.process);
            if (!processTrack) {
                processTrack = findProcessTrack(pattern.process);
                if (processTrack) {
                    console.log(`  🔎 找到进程 track: ${pattern.process}`);
                    processCache.set(pattern.process, processTrack);
                    expandProcessTrack(processTrack);
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }

            if (!processTrack) {
                notFoundTracks.push(pattern.desc);
                console.log(`  ❌ 失败: 未找到进程`);
                continue;
            }

            const threadTracks = findThreadTracks(processTrack, pattern.thread, {
                useChip: pattern.useChip || false,
                partial: pattern.partial || false,
                matchAppName: pattern.matchAppName || null,
                processName: pattern.process || ''
            });

            if (threadTracks.length === 0) {
                notFoundTracks.push(pattern.desc);
                console.log(`  ❌ 失败: 未找到线程`);
                continue;
            }

            if (pattern.pinAll) {
                const maxCount = pattern.maxCount || threadTracks.length;
                const targetTracks = threadTracks.slice(0, maxCount);
                let successCount = 0;

                for (let j = 0; j < targetTracks.length; j++) {
                    console.log(`  [${j + 1}/${targetTracks.length}]`);
                    const success = pinTrack(targetTracks[j]);
                    if (success) {
                        successCount++;
                        pinnedCount++;
                        console.log(`  ✅ 成功 pin (${j + 1}/${targetTracks.length})`);
                        await new Promise(resolve => setTimeout(resolve, 200));
                    } else {
                        console.log(`  ❌ 失败: 无法 pin (${j + 1}/${targetTracks.length})`);
                    }
                }

                if (targetTracks.length < threadTracks.length) {
                    console.log(`  ℹ️  已限制只 pin 前 ${maxCount} 个（共找到 ${threadTracks.length} 个）`);
                }

                if (successCount === 0) notFoundTracks.push(pattern.desc);
            } else {
                const success = pinTrack(threadTracks[0]);
                if (success) {
                    pinnedCount++;
                    console.log(`  ✅ 成功 pin`);
                    await new Promise(resolve => setTimeout(resolve, 200));
                } else {
                    notFoundTracks.push(pattern.desc);
                    console.log(`  ❌ 失败: 无法 pin`);
                }
            }
        }

        return { pinnedCount, notFoundTracks };
    }

    function collectElementsDeep(root, selector, result = []) {
        if (!root) return result;

        if (root.querySelectorAll) {
            result.push(...root.querySelectorAll(selector));
        }

        const allNodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (const node of allNodes) {
            if (node.shadowRoot) {
                collectElementsDeep(node.shadowRoot, selector, result);
            }
        }

        return result;
    }

    function findProcessTrack(processName) {
        const allTracks = collectElementsDeep(document, '.pf-track');
        const needle = (processName || '').toLowerCase();

        for (const track of allTracks) {
            const titleEl = track.querySelector('.pf-track__title-popup');
            const text = ((titleEl && titleEl.textContent) || track.textContent || '').toLowerCase();
            if (text.includes(needle)) {
                const header = track.querySelector('.pf-track__header--summary');
                if (header) return track;
            }
        }
        return null;
    }

    function expandProcessTrack(processTrack) {
        const expandButton = processTrack.querySelector('.pf-track__collapse-button');
        if (expandButton) {
            const icon = expandButton.querySelector('i');
            if (icon && icon.textContent.includes('expand_more')) {
                console.log(`  📂 展开进程 track`);
                expandButton.click();
                return true;
            }
        }
        return false;
    }

    function normalizeForMatch(text) {
        return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    function isLooselyMatched(text, keyword) {
        const source = (text || '').toLowerCase();
        const target = (keyword || '').toLowerCase();
        if (!target) return false;
        if (source.includes(target)) return true;

        const sourceNorm = normalizeForMatch(source);
        const targetNorm = normalizeForMatch(target);
        return targetNorm.length > 0 && sourceNorm.includes(targetNorm);
    }

    function getTrackChildrenContainer(processTrack) {
        const containerSelectors = [
            '.pf-track__children',
            '.pf-track-group__children',
            '[data-track-children]'
        ];

        for (const selector of containerSelectors) {
            let container = processTrack.querySelector(selector);
            if (!container && processTrack.shadowRoot) {
                container = processTrack.shadowRoot.querySelector(selector);
            }
            if (!container) {
                container = collectElementsDeep(processTrack, selector)[0] || null;
            }
            if (container) return container;
        }

        return null;
    }

    function collectSiblingChildTracks(processTrack) {
        if (!processTrack || !processTrack.parentElement) return [];

        const allTracks = Array.from(processTrack.parentElement.querySelectorAll(':scope > .pf-track'));
        const startIndex = allTracks.indexOf(processTrack);
        if (startIndex < 0) return [];

        const siblings = [];
        for (let i = startIndex + 1; i < allTracks.length; i++) {
            const track = allTracks[i];
            const isSummaryTrack = !!collectElementsDeep(track, '.pf-track__header--summary')[0];
            if (isSummaryTrack) break;
            siblings.push(track);
        }

        return siblings;
    }

    function findThreadTracks(processTrack, threadName, options = {}) {
        const { useChip = false, partial = false, matchAppName = null, processName = '' } = options;
        const childrenContainer = getTrackChildrenContainer(processTrack);

        if (!childrenContainer) {
            console.log(`  ⚠️  未找到 pf-track__children 容器`);
            const localFallbackTracks = collectElementsDeep(processTrack, '.pf-track')
                .filter((track) => track !== processTrack);
            const siblingFallbackTracks = collectSiblingChildTracks(processTrack);

            const globalFallbackTracks = collectElementsDeep(document, '.pf-track').filter((track) => {
                if (track === processTrack) return false;
                const titleEl = collectElementsDeep(track, '.pf-track__title-popup')[0];
                const text = ((titleEl && titleEl.textContent) || track.textContent || '');
                return isLooselyMatched(text, processName);
            });

            let fallbackChildTracks = [];
            if (localFallbackTracks.length > 0) {
                fallbackChildTracks = localFallbackTracks;
            } else if (siblingFallbackTracks.length > 0) {
                fallbackChildTracks = siblingFallbackTracks;
                console.log(`  ℹ️  使用 sibling 回退，发现 ${siblingFallbackTracks.length} 个候选子 track`);
            } else {
                fallbackChildTracks = globalFallbackTracks;
            }

            if (fallbackChildTracks.length === 0) return [];

            console.log(`  ℹ️  回退查找，共发现 ${fallbackChildTracks.length} 个候选子 track`);
            return matchThreadTracks(fallbackChildTracks, threadName, options);
        }

        let childTracks = Array.from(childrenContainer.querySelectorAll(':scope > .pf-track'));
        if (childTracks.length === 0) {
            childTracks = collectElementsDeep(childrenContainer, '.pf-track');
        }

        return matchThreadTracks(childTracks, threadName, options);
    }

    function findPinControl(trackNode) {
        if (!trackNode) return { button: null, isPinned: false };

        const trackButtons = collectElementsDeep(trackNode, '.pf-track__buttons')[0] || trackNode;
        const candidates = collectElementsDeep(trackButtons, 'button');

        for (const btn of candidates) {
            const buttonText = ((btn.textContent || '') + ' ' + (btn.title || '') + ' ' + (btn.getAttribute('aria-label') || '')).toLowerCase();
            const icon = collectElementsDeep(btn, 'i')[0] || collectElementsDeep(btn, '.pf-icon')[0];
            const iconText = icon ? (icon.textContent || '').toLowerCase() : '';
            const iconClass = icon ? (icon.className || '').toLowerCase() : '';

            const isPinLike = buttonText.includes('pin') || buttonText.includes('keep') || iconText.includes('push_pin') || iconText.includes('pin');
            if (!isPinLike) continue;

            const isPinned = buttonText.includes('unpin') || iconClass.includes('pf-filled');
            return { button: btn, isPinned };
        }

        return { button: null, isPinned: false };
    }

    function matchThreadTracks(childTracks, threadName, options = {}) {
        const { useChip = false, partial = false, matchAppName = null } = options;
        let searchDesc = `  🔎 在 ${childTracks.length} 个子 track 中查找线程: ${threadName}`;
        if (useChip) searchDesc += ' (从 chip 查找)';
        if (partial) searchDesc += ' (部分匹配)';
        if (matchAppName) searchDesc += ` (需包含 ${matchAppName})`;
        else if (partial) searchDesc += ' (匹配所有)';
        console.log(searchDesc);

        const matchedTracks = [];

        for (const track of childTracks) {
            let matched = false;

            if (useChip) {
                const chipLabels = collectElementsDeep(track, '.pf-chip__label');
                for (const chip of chipLabels) {
                    const chipText = (chip.textContent || '').toLowerCase();
                    const normalizedThreadName = threadName.toLowerCase();
                    const isMainAlias = normalizedThreadName === 'main' && chipText.includes('main thread');
                    if (isMainAlias || isLooselyMatched(chipText, normalizedThreadName)) {
                        matched = true;
                        break;
                    }
                }
            } else {
                const titleEl = collectElementsDeep(track, '.pf-track__title-popup')[0];
                const titleText = ((titleEl && titleEl.textContent) || track.textContent || '');
                if (titleText) {
                    if (partial) {
                        matched = isLooselyMatched(titleText, threadName);
                    } else {
                        const titleTextLower = titleText.toLowerCase();
                        const threadNameLower = threadName.toLowerCase();
                        matched = titleTextLower === threadNameLower || isLooselyMatched(titleText, threadName);
                    }
                    if (matched && matchAppName) {
                        matched = isLooselyMatched(titleText, matchAppName);
                        if (matched) {
                            console.log(`    🎯 匹配 BufferTX: ${titleText.substring(0, 100)}`);
                        } else {
                            if (matchAppName == "Process") {
                                matched = true;
                                console.log(`    🎯 NOT 匹配 BufferTX but pin it due to no process name: ${titleText.substring(0, 100)}`);
                            } else {
                                console.log(`    🎯 NOT 匹配 BufferTX : ${titleText.substring(0, 100)}`);
                            }
                        }
                    }
                }
            }

            if (matched) matchedTracks.push(track);
        }

        if (matchedTracks.length > 0) {
            const actionableTracks = matchedTracks.filter(track => !!findPinControl(track).button);
            if (actionableTracks.length > 0) {
                if (actionableTracks.length !== matchedTracks.length) {
                    console.log(`  ℹ️  已过滤无 pin 按钮的候选 track: ${matchedTracks.length} -> ${actionableTracks.length}`);
                }
                matchedTracks.length = 0;
                matchedTracks.push(...actionableTracks);
            }
            console.log(`  ✅ 找到 ${matchedTracks.length} 个匹配的线程 track`);
        } else {
            console.log(`  ❌ 未找到线程 track: ${threadName}`);
        }

        return matchedTracks;
    }

    function pinTrack(trackNode) {
        if (!trackNode) return false;

        const revealEvents = ['mouseenter', 'mouseover', 'mousemove'];
        for (const eventName of revealEvents) {
            trackNode.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window }));
        }

        const header = collectElementsDeep(trackNode, '.pf-track__header')[0] || trackNode;
        for (const eventName of revealEvents) {
            header.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window }));
        }

        const pinScopes = [trackNode, header];
        for (const scope of pinScopes) {
            const pinControl = findPinControl(scope);
            if (!pinControl.button) continue;

            if (pinControl.isPinned) {
                console.log('  ℹ️  线程已是 pinned 状态，跳过点击');
                return true;
            }

            pinControl.button.click();
            return true;
        }

        return false;
    }

    function showResultNotification(pinnedCount, failedCount) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 100002;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            min-width: 300px;
        `;

        notification.innerHTML = `
            <div style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">
                📊 Pin 操作完成
            </div>
            <div style="font-size: 14px; color: #666;">
                ✅ 成功: ${pinnedCount} 个<br/>
                ❌ 失败: ${failedCount} 个
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transition = 'opacity 0.3s';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

})();
