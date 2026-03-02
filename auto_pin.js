// ==UserScript==
// @name         Perfetto UI Auto Pin Threads
// @namespace    http://tampermonkey.net/
// @version      1.28
// @description  在 Perfetto UI 中自动批量 pin 住 SurfaceFlinger 和 App 的关键渲染线程（支持多进程）
// @author       Jet (Cloudrise)
// @match        https://ui.perfetto.dev/*
// @match        https://*.perfetto.dev/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 延迟初始化，等待 Perfetto UI 完成首屏渲染后再注入按钮和监控器。
  setTimeout(() => {
    createFloatingButton();
    startButtonMonitor();
  }, 1000);

  // 监听页面 DOM 变化并周期兜底，避免按钮被页面重绘后消失。
  function startButtonMonitor() {
    const observer = new MutationObserver(() => {
      ensureButtonExists();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(ensureButtonExists, 2000);
  }

  // 检查悬浮按钮是否存在，不存在则重建。
  function ensureButtonExists() {
    const existingButton = document.getElementById('perfetto-auto-pin-btn');
    if (!existingButton) {
      console.log('🔄 检测到按钮被移除，重新创建...');
      createFloatingButton();
    }
  }

  // 创建固定在页面右下角的 Pin 悬浮按钮，并绑定交互事件。
  function createFloatingButton() {
    if (document.getElementById('perfetto-auto-pin-btn')) return;

    const button = document.createElement('button');
    button.id = 'perfetto-auto-pin-btn';
    button.innerHTML = '📌';

    button.style.cssText = `
      position: fixed;
      bottom: 90px;
      right: 30px;
      z-index: 99999;
      width: 56px;
      height: 56px;
      padding: 0;
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

  // 弹出输入对话框：支持 app / sf / ss 多进程输入。
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
      if (e.key === 'Enter') confirmBtn.click();
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

    cancelBtn.addEventListener('click', () => dialog.remove());
  }

  // 解析用户输入，拆分为 app 列表、surfaceflinger、system_server 三类。
  function parseProcessInput(input) {
    const processes = { apps: [], surfaceflinger: null, system_server: null };
    const parts = input.split(';').map(p => p.trim()).filter(p => p);

    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      if (lowerPart.startsWith('sf:')) processes.surfaceflinger = part.substring(3);
      else if (lowerPart.startsWith('ss:')) processes.system_server = part.substring(3);
      else processes.apps.push(part);
    }
    return processes;
  }

  // 统一构建线程匹配选项，减少调用处重复参数拼装。
  function createMatchOptions(pattern, enforceProcessName = false) {
    return {
      useChip: pattern.useChip || false,
      partial: pattern.partial || false,
      matchAppName: pattern.matchAppName || null,
      processName: pattern.process || '',
      enforceProcessName
    };
  }

  // 主流程：展开轨道、构建规则、批量查找并 pin 线程。
  async function autoPinTracks(inputString) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 开始自动 Pin 线程`);
    console.log(`📱 输入: ${inputString}`);
    console.log(`${'='.repeat(60)}\n`);

    const processes = parseProcessInput(inputString);
    console.log('解析结果:', processes);

    // 优先全量展开轨道，提升后续查找命中率。
    await expandAllTracks();

    const sfIdentifier = processes.surfaceflinger || "surfaceflinger";
    const ssIdentifier = processes.system_server || "system_server";

    // 先解析每个 app 的完整包名（若可获得），用于 BufferTX/QueuedBuffer 精准过滤。
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

      appPackageNames.push({ id: appId, packageName, hasPackageName });
    }

    let pinnedCount = 0;
    let notFoundTracks = [];
    let errorDetails = [];
    const processCache = new Map();

    // 对每个 app 执行一轮规则化 pin。
    for (let appIndex = 0; appIndex < appPackageNames.length; appIndex++) {
      const { id: appIdentifier, packageName: appPackageName, hasPackageName } = appPackageNames[appIndex];

      console.log(`\n${'='.repeat(60)}`);
      console.log(`📱 处理 App ${appIndex + 1}/${appPackageNames.length}: ${appIdentifier}`);
      console.log(`${'='.repeat(60)}\n`);

      // App 侧关键线程规则（含系统关联线程）。
      const appTrackPatterns = [
        { process: ssIdentifier, thread: "InputDispatcher", desc: "input dispatcher", pinAll: true },
        { process: sfIdentifier, thread: "VSYNC-app", desc: `[App ${appIndex + 1}] surfaceflinger / VSYNC-app` },
        { process: appIdentifier, thread: "Expected Timeline", desc: `[App ${appIndex + 1}] app / Expected Timeline` },
        { process: appIdentifier, thread: "Actual Timeline", desc: `[App ${appIndex + 1}] app / Actual Timeline` },
        { process: appIdentifier, thread: "aq:pending", desc: `[App ${appIndex + 1}] app / aq` },
        { process: appIdentifier, thread: "deliverInputEvent", desc: `[App ${appIndex + 1}] app / deliverInputEvent` },
        { process: appIdentifier, thread: "main", desc: `[App ${appIndex + 1}] app / main thread`, useChip: false, pinAll: true },
        { process: appIdentifier, thread: "RenderThread", desc: `[App ${appIndex + 1}] app / RenderThread`, pinAll: true, maxCount: 2 },
        { process: appIdentifier, thread: "GPU completion", desc: `[App ${appIndex + 1}] app / GPU completion`, pinAll: true },
        { process: appIdentifier, thread: "BLAST Consumer", desc: `[App ${appIndex + 1}] app / BLAST Consumer`, pinAll: true },
      ];

      // QueuedBuffer 按“包名可用/不可用”选择精确匹配或全量匹配策略。
      if (hasPackageName) {
        appTrackPatterns.push({
          process: appIdentifier,
          thread: "QueuedBuffer",
          desc: `[App ${appIndex + 1}] app / QueuedBuffer`,
          partial: true,
          matchAppName: appPackageName,
          pinAll: true
        });
      } else {
        appTrackPatterns.push({
          process: appIdentifier,
          thread: "QueuedBuffer",
          desc: `[App ${appIndex + 1}] app / QueuedBuffer (所有)`,
          pinAll: true
        });
      }

      // BufferTX 同样按包名可用性切换匹配策略。
      if (hasPackageName) {
        appTrackPatterns.push({
          process: sfIdentifier,
          thread: "BufferTX",
          desc: `[App ${appIndex + 1}] surfaceflinger / BufferTX`,
          partial: true,
          matchAppName: appPackageName,
          pinAll: true
        });
      } else {
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
      errorDetails.push(...result.errorDetails);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔧 处理 SurfaceFlinger 和 System Server`);
    console.log(`${'='.repeat(60)}\n`);

    // 最后处理 SurfaceFlinger / SystemServer 全局线程。
    const systemTrackPatterns = [
      { process: sfIdentifier, thread: "VSYNC-sf", desc: "surfaceflinger / VSYNC-sf" },
      { process: sfIdentifier, thread: "Expected Timeline", desc: "surfaceflinger / Expected Timeline" },
      { process: sfIdentifier, thread: "Actual Timeline", desc: "surfaceflinger / Actual Timeline" },
      { process: sfIdentifier, thread: "main", desc: "surfaceflinger / main thread", useChip: false, pinAll: true },
      { process: sfIdentifier, thread: "GPU completion", desc: "surfaceflinger / GPU completion", useChip: false, pinAll: true },
      { process: sfIdentifier, thread: "hasClientComposition", desc: "surfaceflinger / hasClientComposition", useChip: false, pinAll: true },
      { process: sfIdentifier, thread: "RenderEngine", desc: "surfaceflinger / RenderEngine", useChip: false, pinAll: true },
      { process: sfIdentifier, thread: "RE Completion", desc: "surfaceflinger / RE Completion", useChip: false, pinAll: true },
      { process: sfIdentifier, thread: "FramebufferSurface", desc: "surfaceflinger / FramebufferSurface" },
      { process: ssIdentifier, thread: "Focused app", desc: "focused app" },
    ];

    const systemResult = await pinTracksByPatterns(systemTrackPatterns, processCache);
    pinnedCount += systemResult.pinnedCount;
    notFoundTracks.push(...systemResult.notFoundTracks);
    errorDetails.push(...systemResult.errorDetails);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 执行完成`);
    console.log(`✅ 成功 pin: ${pinnedCount} 个 track`);
    console.log(`❌ 失败: ${notFoundTracks.length} 个模式`);

    if (notFoundTracks.length > 0) {
      console.log(`\n未能 pin 的 tracks:`);
      notFoundTracks.forEach(track => console.log(`  - ${track}`));
    }

    if (errorDetails.length > 0) {
      console.log(`\n详细错误信息（无法 pin / 找不到 track）:`);
      errorDetails.forEach((detail, index) => {
        console.error(`  [${index + 1}] ${detail.desc}`);
        console.error(`      reason: ${detail.reason}`);
        console.error(`      process: ${detail.process || '(unknown)'}, thread: ${detail.thread || '(unknown)'}`);
        if (detail.trackText) console.error(`      track: ${detail.trackText}`);
      });
    }

    console.log(`${'='.repeat(60)}\n`);
    showResultNotification(pinnedCount, notFoundTracks.length);
  }

  // 按给定 pattern 执行批量 pin，返回成功数与失败明细。
  async function pinTracksByPatterns(trackPatterns, processCache) {
    let pinnedCount = 0;
    let notFoundTracks = [];
    let errorDetails = [];

    for (let i = 0; i < trackPatterns.length; i++) {
      const pattern = trackPatterns[i];
      console.log(`\n📍 [${i + 1}/${trackPatterns.length}] ${pattern.desc}`);

      let processTrack = processCache.get(pattern.process);
      if (processTrack && !processTrack.isConnected) {
        processCache.delete(pattern.process);
        processTrack = null;
      }

      if (!processTrack) {
        processTrack = findProcessTrack(pattern.process);
        if (processTrack) {
          console.log(`  🔎 找到进程 track: ${pattern.process}`);
          processCache.set(pattern.process, processTrack);
          expandProcessTrack(processTrack);
          await sleep(120);
          await sleep(280);
        }
      }

      let threadTracks = [];
      if (!processTrack) {
        console.log(`  ⚠️  未找到进程，回退为全局线程搜索`);
        threadTracks = matchThreadTracks(
          collectElementsDeep(document, '.pf-track'),
          pattern.thread,
          createMatchOptions(pattern, true)
        );
      } else {
        threadTracks = findThreadTracks(processTrack, pattern.thread, createMatchOptions(pattern));
      }

      if (threadTracks.length === 0) {
        notFoundTracks.push(pattern.desc);
        console.log(`  ❌ 失败: 未找到线程`);
        errorDetails.push({
          desc: pattern.desc,
          process: pattern.process,
          thread: pattern.thread,
          reason: '找到进程 track 但未匹配到线程 track'
        });
        continue;
      }

      if (pattern.pinAll) {
        const maxCount = pattern.maxCount || threadTracks.length;
        let successCount = 0;

        for (let j = 0; j < maxCount; j++) {
          console.log(`  [${j + 1}/${maxCount}]`);

          let liveProcessTrack = processCache.get(pattern.process);
          if (liveProcessTrack && !liveProcessTrack.isConnected) {
            processCache.delete(pattern.process);
            liveProcessTrack = null;
          }
          if (!liveProcessTrack) {
            liveProcessTrack = findProcessTrack(pattern.process);
            if (liveProcessTrack) {
              processCache.set(pattern.process, liveProcessTrack);
              expandProcessTrack(liveProcessTrack);
              await sleep(150);
            }
          }

          const liveThreadTracks = liveProcessTrack
            ? findThreadTracks(liveProcessTrack, pattern.thread, createMatchOptions(pattern))
            : matchThreadTracks(
              collectElementsDeep(document, '.pf-track'),
              pattern.thread,
              createMatchOptions(pattern, true)
            );

          if (liveThreadTracks.length === 0) {
            console.log('  ⚠️  动态重查后未找到线程，提前结束当前模式');
            break;
          }

          const targetTrack = liveThreadTracks.find((track) => {
            const pinControl = findPinControl(track);
            return pinControl.button && !pinControl.isPinned;
          }) || liveThreadTracks[0];

          const success = await pinTrack(targetTrack);
          if (success) {
            successCount++;
            pinnedCount++;
            console.log(`  ✅ 成功 pin (${j + 1}/${maxCount})`);
            await sleep(200);
          } else {
            console.log(`  ❌ 失败: 无法 pin (${j + 1}/${maxCount})`);
            const titleEl = collectElementsDeep(targetTrack, '.pf-track__title-popup')[0];
            const trackText = ((titleEl && titleEl.textContent) || targetTrack.textContent || '').trim().slice(0, 180);
            errorDetails.push({
              desc: pattern.desc,
              process: pattern.process,
              thread: pattern.thread,
              reason: '已找到线程 track，但未找到可点击的 pin 控件（按钮不可见/DOM 结构变化）',
              trackText
            });
          }
        }

        if (maxCount < threadTracks.length) {
          console.log(`  ℹ️  已限制只 pin 前 ${maxCount} 个（共找到 ${threadTracks.length} 个）`);
        }
        if (successCount === 0) notFoundTracks.push(pattern.desc);
      } else {
        const success = await pinTrack(threadTracks[0]);
        if (success) {
          pinnedCount++;
          console.log(`  ✅ 成功 pin`);
          await sleep(200);
        } else {
          notFoundTracks.push(pattern.desc);
          console.log(`  ❌ 失败: 无法 pin`);
          const titleEl = collectElementsDeep(threadTracks[0], '.pf-track__title-popup')[0];
          const trackText = ((titleEl && titleEl.textContent) || threadTracks[0].textContent || '').trim().slice(0, 180);
          errorDetails.push({
            desc: pattern.desc,
            process: pattern.process,
            thread: pattern.thread,
            reason: '已找到线程 track，但未找到可点击的 pin 控件（按钮不可见/DOM 结构变化）',
            trackText
          });
        }
      }
    }

    return { pinnedCount, notFoundTracks, errorDetails };
  }

  // 深度查询：支持穿透 Shadow DOM 收集元素。
  function collectElementsDeep(root, selector, result = []) {
    if (!root) return result;

    if (root.querySelectorAll) result.push(...root.querySelectorAll(selector));

    const allNodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const node of allNodes) {
      if (node.shadowRoot) collectElementsDeep(node.shadowRoot, selector, result);
    }
    return result;
  }

  // 通过标题文本定位“进程摘要轨道”。
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

  // 展开进程轨道（若当前处于折叠态）。
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

  // 点击 Perfetto 的 “Expand all” 按钮。
  async function expandAllTracks() {
    const expandAllButton = collectElementsDeep(document, 'button[title="Expand all"]')[0];
    if (!expandAllButton) {
      console.log('⚠️ 未找到 Expand all 按钮，跳过全量展开');
      return;
    }

    console.log('📂 点击 Expand all 展开所有 track');
    expandAllButton.click();
    await sleep(300);
  }

  // 归一化文本，弱化符号差异带来的匹配误差。
  function normalizeForMatch(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  // 宽松匹配：先直接包含，再归一化后包含。
  function isLooselyMatched(text, keyword) {
    const source = (text || '').toLowerCase();
    const target = (keyword || '').toLowerCase();
    if (!target) return false;
    if (source.includes(target)) return true;

    const sourceNorm = normalizeForMatch(source);
    const targetNorm = normalizeForMatch(target);
    return targetNorm.length > 0 && sourceNorm.includes(targetNorm);
  }

  // 聚合 track 可检索文本（标题、属性、正文）。
  function getTrackSearchText(track) {
    if (!track) return '';
    const titleEl = collectElementsDeep(track, '.pf-track__title-popup')[0];
    const titleText = (titleEl && titleEl.textContent) || '';
    const refText = track.getAttribute('ref') || '';
    const dataName = track.getAttribute('data-name') || '';
    const fallbackText = track.textContent || '';
    return `${titleText} ${refText} ${dataName} ${fallbackText}`.trim();
  }

  // 收集某进程 summary 后面的同层子轨道，直到下一个 summary。
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

  // 在线程范围内查找目标线程，逐级回退：sibling -> local -> global。
  function findThreadTracks(processTrack, threadName, options = {}) {
    const { useChip = false, partial = false, matchAppName = null, processName = '' } = options;

    const siblingFallbackTracks = collectSiblingChildTracks(processTrack);
    if (siblingFallbackTracks.length > 0) {
      console.log(`  ℹ️  使用 sibling 回退，发现 ${siblingFallbackTracks.length} 个候选子 track`);
      return matchThreadTracks(siblingFallbackTracks, threadName, {
        useChip, partial, matchAppName, processName,
        enforceProcessName: false
      });
    }

    const localFallbackTracks = collectElementsDeep(processTrack, '.pf-track')
      .filter((track) => track !== processTrack);

    if (localFallbackTracks.length > 0) {
      console.log(`  ℹ️  使用 local 深搜回退，发现 ${localFallbackTracks.length} 个候选子 track`);
      return matchThreadTracks(localFallbackTracks, threadName, {
        useChip, partial, matchAppName, processName,
        enforceProcessName: false
      });
    }

    // ================================
    // 最小 patch：全局回退时不做进程名二次过滤
    // 解释：线程标题往往不含 "surfaceflinger"/pid 文本，进程名过滤会误杀
    // ================================
    console.log(`  ⚠️  未找到局部候选，回退为全局线程搜索（不做进程名二次过滤）`);
    const globalTracks = collectElementsDeep(document, '.pf-track').filter((track) => track !== processTrack);

    return matchThreadTracks(globalTracks, threadName, {
      useChip, partial, matchAppName, processName,
      enforceProcessName: false   // <-- 关键 patch
    });
  }

  // 对候选轨道执行匹配判定，支持 chip/文本/部分匹配等策略。
  function matchThreadTracks(childTracks, threadName, options = {}) {
    const {
      useChip = false,
      partial = false,
      matchAppName = null,
      processName = '',
      enforceProcessName = false
    } = options;

    let searchDesc = `  🔎 在 ${childTracks.length} 个子 track 中查找线程: ${threadName}`;
    if (useChip) searchDesc += ' (从 chip 查找)';
    if (partial) searchDesc += ' (部分匹配)';
    if (matchAppName) searchDesc += ` (需包含 ${matchAppName})`;
    else if (partial) searchDesc += ' (匹配所有)';
    if (enforceProcessName) searchDesc += ' (启用进程名二次过滤)';
    console.log(searchDesc);

    const matchedTracks = [];

    for (const track of childTracks) {
      let matched = false;

      if (useChip) {
        const chipLabels = collectElementsDeep(track, '.pf-chip__label');
        for (const chip of chipLabels) {
          const chipText = (chip.textContent || '').toLowerCase();
          const normalizedThreadName = (threadName || '').toLowerCase();
          const isMainAlias = normalizedThreadName === 'main' && chipText.includes('main thread');
          if (isMainAlias || isLooselyMatched(chipText, normalizedThreadName)) {
            matched = true;
            break;
          }
        }
      } else {
        const titleText = getTrackSearchText(track);
        if (titleText) {
          if (partial) {
            matched = isLooselyMatched(titleText, threadName);
          } else {
            const titleTextLower = titleText.toLowerCase();
            const threadNameLower = (threadName || '').toLowerCase();
            matched = titleTextLower === threadNameLower || isLooselyMatched(titleText, threadName);
          }

          if (matched && enforceProcessName && processName) {
            matched = isLooselyMatched(titleText, processName);
          }

          if (matched && matchAppName) {
            matched = isLooselyMatched(titleText, matchAppName);
            if (!matched && matchAppName === "Process") matched = true;
          }
        }
      }

      if (matched) matchedTracks.push(track);
    }

    if (matchedTracks.length > 0) console.log(`  ✅ 找到 ${matchedTracks.length} 个匹配的线程 track`);
    else console.log(`  ❌ 未找到线程 track: ${threadName}`);

    return matchedTracks;
  }

  // 简单 sleep 工具，用于等待 UI 状态更新。
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 在 track 中查找 pin 控件，并推断当前是否已 pinned。
  function findPinControl(trackNode) {
    if (!trackNode) return { button: null, isPinned: false };

    const trackButtons =
      collectElementsDeep(trackNode, '.pf-track__buttons')[0] ||
      collectElementsDeep(trackNode, '.pf-track__actions')[0] ||
      trackNode;

    const pinButtonByTitle = collectElementsDeep(trackButtons, 'button[title="Pin to top"], button[title="Unpin from top"]')[0];
    if (pinButtonByTitle) {
      const title = (pinButtonByTitle.getAttribute('title') || '').toLowerCase();
      return { button: pinButtonByTitle, isPinned: title.includes('unpin') };
    }

    const iconPinButton = collectElementsDeep(trackButtons, 'button').find((btn) => {
      const icon = collectElementsDeep(btn, 'i.pf-icon, .pf-icon')[0];
      const iconText = ((icon && icon.textContent) || '').toLowerCase();
      return iconText.includes('push_pin');
    });
    if (iconPinButton) {
      const icon = collectElementsDeep(iconPinButton, 'i.pf-icon, .pf-icon')[0];
      const iconClass = ((icon && icon.className) || '').toLowerCase();
      return { button: iconPinButton, isPinned: iconClass.includes('pf-filled') };
    }

    const directButtons = collectElementsDeep(trackButtons, 'button');
    const ariaButtons = collectElementsDeep(trackButtons, '[aria-label*="pin" i], [title*="pin" i], [aria-label*="keep" i], [title*="keep" i]');
    const candidates = [...new Set([...directButtons, ...ariaButtons])];

    for (const btn of candidates) {
      const buttonText = ((btn.textContent || '') + ' ' + (btn.title || '') + ' ' + (btn.getAttribute('aria-label') || '')).toLowerCase();
      const icon = collectElementsDeep(btn, 'i')[0] || collectElementsDeep(btn, '.pf-icon')[0];
      const iconText = icon ? (icon.textContent || '').toLowerCase() : '';
      const iconClass = icon ? (icon.className || '').toLowerCase() : '';

      const isPinLike = buttonText.includes('pin') || buttonText.includes('keep') || iconText.includes('push_pin') || iconText.includes('pin');
      if (!isPinLike) continue;

      const isPinned = buttonText.includes('unpin') || iconClass.includes('pf-filled');
      const clickable = btn.closest('button, [role="button"]') || btn;
      return { button: clickable, isPinned };
    }

    return { button: null, isPinned: false };
  }

  // 对轨道触发右键菜单事件，作为 pin 按钮找不到时的兜底路径。
  function openTrackContextMenu(trackNode) {
    const eventTarget =
      collectElementsDeep(trackNode, '.pf-track__header')[0] ||
      collectElementsDeep(trackNode, '.pf-track__title-popup')[0] ||
      trackNode;

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      buttons: 2,
      clientX: 24,
      clientY: 24
    });

    return eventTarget.dispatchEvent(event);
  }

  // 通过上下文菜单执行 “Pin to top”。
  async function tryPinViaContextMenu(trackNode) {
    openTrackContextMenu(trackNode);
    await sleep(60);

    const pinMenuSelectors = ['[role="menuitem"]', '.pf-popup-menu-item', '.pf-menu-item'];
    for (const selector of pinMenuSelectors) {
      const items = collectElementsDeep(document, selector);
      const pinItem = items.find((item) => {
        const text = (item.textContent || '').toLowerCase();
        return text.includes('pin to top') || (text.includes('pin') && text.includes('top'));
      });
      if (pinItem) {
        pinItem.click();
        return true;
      }
    }
    return false;
  }

  // 对单个轨道执行 pin：优先按钮，失败后回退右键菜单。
  async function pinTrack(trackNode) {
    if (!trackNode) return false;

    if (trackNode.scrollIntoView) {
      trackNode.scrollIntoView({ block: 'center', inline: 'nearest' });
    }

    const revealEvents = ['mouseenter', 'mouseover', 'mousemove'];
    for (const eventName of revealEvents) {
      trackNode.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window }));
    }

    const header = collectElementsDeep(trackNode, '.pf-track__header')[0] || trackNode;
    for (const eventName of revealEvents) {
      header.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window }));
    }

    const pinScopes = [trackNode, header];
    for (let attempt = 0; attempt < 3; attempt++) {
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
      await sleep(80);
    }

    return await tryPinViaContextMenu(trackNode);
  }

  // 显示执行结果通知。
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
