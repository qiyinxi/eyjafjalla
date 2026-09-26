/* =========================================================
 * 声音：环境声景 + 界面音效 + 语音播放
 * 环境声景与音效由 js/soundscape.js 即时合成（形态底色、随滚动变化的场景、生成式音乐、听觉滤镜与助听器）；
 * 这里只保留对外的接口，以及语音播放（语音部分见下方）。
 * 声音默认关闭，由导航栏按钮（或 M 键）开启；音频上下文只在用户手势里创建，关闭或切到后台时挂起。
 *
 * AUDIO.sfx(kind, opt) 可用的音效：
 *   界面：tick hover click tab select slide open close flip reveal
 *   形态：whoosh boom sparkle heal
 *   火山 / 自然：erupt({k:0~1}) steam thunder fizz splash glass crackle throw zoom seed warn
 *   小羊：bleat bell chime
 *
 * AUDIO.hold(key, on)：页面里别的媒体（「影像」区的 MV，key = 'mv'）播放时让位——声景与音效淡出、
 *   排程循环停下、音频上下文挂起；全部 key 都放开后恢复。不改变开关状态。AUDIO.held：当前是否在让位
 * ========================================================= */
window.AUDIO = (() => {
  let ac = null, master, eng = null, enabled = false, form = 'base', clear = false;
  const voice = new Audio();
  voice.preload = 'none';

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0;
      // 声景引擎接管 master 之后的整条链路：听觉滤镜（隔着一层 / 助听器）、耳鸣、限幅，以及全部环境声与音效
      try { eng = window.SOUNDSCAPE ? SOUNDSCAPE.create(ac, master, { voice, voiceBusy: () => !!vsrc && !voice.paused, form, clear }) : null; } catch (e) { eng = null; console.warn('[soundscape]', e); }
      if (!eng) master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  /* 总开关的目标增益：关着 0；有外部媒体占用（见 hold）0；语音播放时闪避到 0.18；平时 0.5 */
  const holds = new Set();
  let ducked = false;
  const level = () => (!enabled || holds.size ? 0 : ducked ? 0.18 : 0.5);

  function setEnabled(on) {
    enabled = !!on;
    if (!ctx()) return;
    master.gain.setTargetAtTime(level(), ac.currentTime, 0.4);
    if (eng) eng.setEnabled(enabled && !holds.size);
  }

  /**
   * 让位：页面里别的媒体（「影像」区的 MV）播放时，环境声景与音效整体淡出、排程循环停下、音频上下文挂起；
   * 全部让位结束后恢复。不改变开关状态（导航栏的按钮照旧显示“开”）。key 用来区分不同的占用方
   */
  function hold(key, on) {
    const was = holds.size > 0;
    if (on) holds.add(key); else holds.delete(key);
    const now = holds.size > 0;
    if (was === now || !ac) return;
    master.gain.setTargetAtTime(level(), ac.currentTime, now ? 0.25 : 0.6);
    if (eng && enabled) eng.setEnabled(!now);
  }

  /** 形态切换：声景交叉淡化到另一套底色与调式，并奏出切换的过渡声（术师＝一次喷发，医疗＝灰烬落下） */
  function setForm(f) { form = f; if (eng) eng.setForm(f); }

  /** 助听器：开机提示音，然后声音从“隔着一层”逐步变清晰 */
  function setClarity(on) { clear = !!on; if (eng) eng.setClarity(clear); }

  /* ---------- 音效（仅在声音开启时；种类见文件开头） ---------- */
  function sfx(kind, opt) {
    if (!enabled || !eng) return;
    eng.sfx(kind, opt);
  }

  /* ---------- 语音 ----------
   * 语音按 CORS 方式加载（PRTS 资源站允许跨域）：语音区打开「听觉模拟」时，才能把它接进 WebAudio 做低通滤波。
   * 接入是一次性的、只在用户点开模拟时发生；在那之前语音仍由 <audio> 直接输出。
   * 某次跨域加载失败、又还没接入 WebAudio 时，去掉 crossorigin 悄悄重试一次（失败一律不提示）。 */
  const SIM_HZ = 520; // 「听觉模拟」的低通截止频率：大致是“隔着一层厚玻璃”的听感
  voice.crossOrigin = 'anonymous';
  let onVoice = null, voiceTok = 0, curUrl = '', retried = false;
  let vsrc = null, vfilt = null, vgain = null, sim = false, mute = false;
  const duck = (on) => { ducked = !!on; if (ac && enabled) master.gain.setTargetAtTime(level(), ac.currentTime, on ? 0.2 : 0.5); };
  function startVoice(url, tok) {
    voice.src = url;
    voice.currentTime = 0;
    const p = voice.play();
    // 被下一条语音打断时，旧的 play() 会以 AbortError 失败：这不是加载失败，也不该通知新语音的回调
    if (p && p.catch) p.catch((e) => { if (!(e && e.name === 'AbortError')) failVoice(tok); });
    return p;
  }
  function failVoice(tok) {
    if (tok !== voiceTok) return;
    if (!vsrc && voice.crossOrigin && !retried && voice.error) {
      retried = true;
      voice.removeAttribute('crossorigin');
      startVoice(curUrl, ++voiceTok);
      return;
    }
    if (onVoice) onVoice('error');
    duck(false);
  }
  function playVoice(url, cb) {
    voice.pause();
    if (!vsrc || !voice.crossOrigin) voice.crossOrigin = 'anonymous';
    curUrl = url;
    retried = false;
    onVoice = cb;
    if (vsrc) ctx(); // 已接入 WebAudio：确保音频上下文在这次点击里恢复运行
    const p = startVoice(url, ++voiceTok);
    duck(true);
    return p;
  }
  function stopVoice() { voice.pause(); if (onVoice) onVoice('end'); duck(false); }
  /** 暂停 / 继续（继续后 <audio> 会再发一次 'playing'） */
  function pauseVoice() { if (voice.paused) return; voice.pause(); if (onVoice) onVoice('pause'); duck(false); }
  function resumeVoice() {
    if (!voice.paused || !voice.currentSrc || voice.ended) return false;
    if (vsrc) ctx();
    const tok = voiceTok, p = voice.play();
    if (p && p.catch) p.catch((e) => { if (!(e && e.name === 'AbortError')) failVoice(tok); });
    duck(true);
    return true;
  }
  /** 把语音接进 WebAudio：<audio> → 低通 → 增益 → 输出。只能接一次，之后一直走这条链 */
  function routeVoice() {
    if (vsrc) return true;
    if (!ctx() || !voice.crossOrigin) return false;
    try {
      const src = ac.createMediaElementSource(voice);
      vfilt = ac.createBiquadFilter();
      vfilt.type = 'lowpass';
      vfilt.frequency.value = 20000;
      vfilt.Q.value = 0.8;
      vgain = ac.createGain();
      src.connect(vfilt).connect(vgain).connect(ac.destination);
      vsrc = src;
    } catch (e) { vsrc = null; }
    return !!vsrc;
  }
  function applyVoiceFx() {
    if (!vfilt) return;
    const t = ac.currentTime, f = vfilt.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(sim ? SIM_HZ : 20000, t + (sim ? 0.5 : 0.9));
    vgain.gain.setTargetAtTime(mute ? 0 : 1, t, 0.08);
  }
  /** 听觉模拟：语音像隔着一层东西；返回是否真的生效（浏览器不支持或资源不允许跨域时为 false） */
  function setVoiceSim(on) {
    sim = !!on && routeVoice();
    applyVoiceFx();
    return sim;
  }
  /** 读唇模式：语音静音，只看口型 */
  function setVoiceMute(on) { mute = !!on; voice.muted = mute; applyVoiceFx(); }
  voice.addEventListener('ended', () => { if (onVoice) onVoice('end'); duck(false); });
  voice.addEventListener('error', () => failVoice(voiceTok));
  voice.addEventListener('playing', () => { if (onVoice) onVoice('playing'); });

  return {
    setEnabled, setForm, setClarity, sfx, playVoice, stopVoice, pauseVoice, resumeVoice, setVoiceSim, setVoiceMute, SIM_HZ, hold,
    get held() { return holds.size > 0; },
    get enabled() { return enabled; }, get clear() { return clear; }, get voiceSim() { return sim; }, get voiceMute() { return mute; }, voice,
  };
})();
