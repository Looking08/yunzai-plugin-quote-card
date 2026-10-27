// src/quote-card/admin.ts
/**
* 名言卡片管理页（HTML + 原生 JS，无构建依赖）
* 页面经 /app/api/quote-card/admin 访问，所有接口都用相对路径，便于挂在不同前缀下。
*/
const adminPageHtml = () => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>名言卡片管理台</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #f5f6f8;
    color: #1f2328;
  }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 28px 20px 60px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 22px; }
  .card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 18px 20px;
    margin-bottom: 18px;
    box-shadow: 0 1px 2px rgba(16,24,40,.04);
  }
  .card h2 { font-size: 15px; margin: 0 0 14px; display: flex; align-items: center; gap: 8px; }
  .tag { font-size: 11px; font-weight: 500; color: #6b7280; background: #f3f4f6; border-radius: 999px; padding: 2px 8px; }
  label { font-size: 13px; color: #4b5563; display: block; margin-bottom: 4px; }
  input[type="number"], input[type="text"], input[type="url"] {
    width: 100%;
    padding: 8px 10px;
    font-size: 14px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    outline: none;
    background: #fff;
  }
  input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.12); }
  .row { display: flex; flex-wrap: wrap; gap: 12px; }
  .row > div { flex: 1 1 140px; }
  button {
    font-size: 13px;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid #d1d5db;
    background: #fff;
    color: #1f2328;
    cursor: pointer;
    transition: .15s;
  }
  button:hover { background: #f9fafb; }
  button.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
  button.primary:hover { background: #4338ca; }
  button.danger { color: #dc2626; border-color: #fecaca; background: #fff5f5; }
  button.danger:hover { background: #fee2e2; }
  button:disabled { opacity: .55; cursor: not-allowed; }
  .presets { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .presets button.on { border-color: #4f46e5; color: #4f46e5; background: #eef2ff; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
  .shot {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
    background: #fafafa;
    display: flex;
    flex-direction: column;
  }
  .shot .thumb { width: 100%; aspect-ratio: 2 / 1; object-fit: cover; background: #f3f4f6; display: block; }
  .shot .meta { padding: 8px 10px; font-size: 12px; color: #6b7280; display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .shot .meta b { color: #111827; font-size: 13px; }
  .shot .meta button { padding: 3px 8px; font-size: 12px; }
  .empty { color: #9ca3af; font-size: 13px; padding: 10px 0; }
  .preview-box { margin-top: 14px; }
  .preview-box img { max-width: 100%; border-radius: 10px; border: 1px solid #e5e7eb; background: #fff; }
  #toast {
    position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%) translateY(20px);
    background: #111827; color: #fff; font-size: 13px; padding: 10px 18px; border-radius: 10px;
    opacity: 0; pointer-events: none; transition: .25s; max-width: 90vw;
  }
  #toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  .hint { font-size: 12px; color: #9ca3af; margin-top: 6px; }
  .thumb-wrap { position: relative; }
  .thumb-wrap input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .switch-row {
    display: flex; align-items: center; justify-content: space-between; gap: 14px;
    margin-top: 16px; padding: 12px 14px;
    border: 1px solid #e5e7eb; border-radius: 10px; background: #fbfbfc;
  }
  .switch-row .txt { flex: 1; }
  .switch-row .txt b { font-size: 13px; color: #111827; display: block; margin-bottom: 3px; }
  .switch-row .txt span { font-size: 12px; color: #6b7280; }
  .switch {
    position: relative; flex: 0 0 auto; width: 46px; height: 26px;
    appearance: none; -webkit-appearance: none; background: #d1d5db;
    border-radius: 999px; cursor: pointer; transition: .18s; outline: none;
  }
  .switch:checked { background: #4f46e5; }
  .switch::after {
    content: ''; position: absolute; top: 3px; left: 3px;
    width: 20px; height: 20px; border-radius: 50%; background: #fff;
    transition: .18s; box-shadow: 0 1px 3px rgba(0,0,0,.25);
  }
  .switch:checked::after { left: 23px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>名言卡片管理台</h1>
  <div class="sub">自定义背景图 + 输出分辨率 · 数据保存在容器 /app/data/quote-card</div>

  <div class="card">
    <h2>输出分辨率 <span class="tag">影响所有新生成的卡片</span></h2>
    <div class="presets" id="presets">
      <button data-w="1280" data-h="640">1280 × 640</button>
      <button data-w="1920" data-h="960">1920 × 960</button>
      <button data-w="1080" data-h="540">1080 × 540</button>
      <button data-w="2560" data-h="1280">2560 × 1280</button>
    </div>
    <div class="row">
      <div>
        <label>宽度 (px)</label>
        <input type="number" id="width" min="480" max="3840" step="2" />
      </div>
      <div>
        <label>高度 (px)</label>
        <input type="number" id="height" min="240" max="2160" step="2" />
      </div>
      <div>
        <label>JPEG 质量</label>
        <input type="number" id="quality" min="60" max="100" step="1" />
      </div>
    </div>
    <div class="hint">建议保持 2:1 比例（如 1280×640），其他比例会等比缩放并留透明边。</div>
    <div class="switch-row">
      <div class="txt">
        <b>照片列表允许所有人查看</b>
        <span>开启后谁都能发「#名言照片列表」看图；关闭后只有主人能看</span>
      </div>
      <input type="checkbox" class="switch" id="listPublic" />
    </div>
    <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
      <button class="primary" id="saveSettings">保存设置</button>
      <button id="preview">生成预览</button>
    </div>
    <div class="preview-box" id="previewBox"></div>
  </div>

  <div class="card">
    <h2>已设置的背景 <span class="tag" id="bgCount">0 张</span></h2>
    <div class="grid" id="bgGrid"></div>
    <div class="empty" id="bgEmpty">还没有自定义背景，生成卡片时会用随机纯色。</div>
  </div>

  <div class="card">
    <h2>添加 / 替换背景 <span class="tag">槽位 1–100</span></h2>
    <div class="row">
      <div style="flex:0 0 120px">
        <label>槽位</label>
        <input type="number" id="slot" min="1" max="100" value="1" />
      </div>
      <div>
        <label>图片地址（可选）</label>
        <input type="url" id="url" placeholder="https://example.com/bg.jpg" />
      </div>
    </div>
    <div style="margin-top:14px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
      <button class="primary" id="pickFile">选择本地图片</button>
      <input type="file" id="file" accept="image/*" style="display:none" />
      <span class="hint" id="fileName" style="margin:0">未选择文件</span>
      <button id="addByUrl">按地址保存</button>
    </div>
    <div class="hint">同一槽位会被覆盖；卡片生成时会从所有已设置槽位里随机取一张。</div>
  </div>
</div>
<div id="toast"></div>
<script>
(function () {
  var API = './';
  var toastTimer = null;

  function toast(msg, isError) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.style.background = isError ? '#b91c1c' : '#111827';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function api(path, options) {
    return fetch(API + path, options).then(function (res) {
      var type = res.headers.get('content-type') || '';
      if (type.indexOf('application/json') === -1) {
        return res.text().then(function (text) { throw new Error(text.slice(0, 120) || ('HTTP ' + res.status)); });
      }
      return res.json().then(function (body) {
        if (body.code !== 200) throw new Error(body.message || '请求失败');
        return body.data;
      });
    });
  }

  function fmtSize(bytes) {
    if (!bytes) return '0 KB';
    return (bytes / 1024).toFixed(0) + ' KB';
  }

  function loadSettings() {
    return api('settings').then(function (data) {
      document.getElementById('width').value = data.width;
      document.getElementById('height').value = data.height;
      document.getElementById('quality').value = data.quality;
      document.getElementById('listPublic').checked = data.listPublic !== false;
      markPreset(data.width, data.height);
    });
  }

  function markPreset(w, h) {
    var buttons = document.querySelectorAll('#presets button');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      b.classList.toggle('on', Number(b.dataset.w) === Number(w) && Number(b.dataset.h) === Number(h));
    }
  }

  function loadBackgrounds() {
    return api('backgrounds').then(function (data) {
      var grid = document.getElementById('bgGrid');
      var empty = document.getElementById('bgEmpty');
      document.getElementById('bgCount').textContent = data.slots.length + ' 张';
      grid.innerHTML = '';
      empty.style.display = data.slots.length ? 'none' : 'block';

      data.slots.forEach(function (item) {
        var cell = document.createElement('div');
        cell.className = 'shot';
        var img = document.createElement('img');
        img.className = 'thumb';
        img.loading = 'lazy';
        img.src = 'backgrounds/' + item.slot + '?v=' + item.updatedAt;
        cell.appendChild(img);

        var meta = document.createElement('div');
        meta.className = 'meta';
        var label = document.createElement('span');
        label.innerHTML = '<b>#' + item.slot + '</b> · ' + item.ext + ' · ' + fmtSize(item.size);
        var del = document.createElement('button');
        del.className = 'danger';
        del.textContent = '删除';
        del.onclick = function () { removeBackground(item.slot); };
        meta.appendChild(label);
        meta.appendChild(del);
        cell.appendChild(meta);
        grid.appendChild(cell);
      });
    });
  }

  function removeBackground(slot) {
    if (!confirm('删除槽位 ' + slot + ' 的背景？')) return;
    api('backgrounds/' + slot, { method: 'DELETE' })
      .then(function () { toast('槽位 ' + slot + ' 已删除'); return loadBackgrounds(); })
      .catch(function (err) { toast(err.message, true); });
  }

  function saveSettings() {
    var payload = {
      width: Number(document.getElementById('width').value),
      height: Number(document.getElementById('height').value),
      quality: Number(document.getElementById('quality').value),
      listPublic: document.getElementById('listPublic').checked
    };
    var btn = document.getElementById('saveSettings');
    btn.disabled = true;
    api('settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (data) {
        document.getElementById('width').value = data.width;
        document.getElementById('height').value = data.height;
        document.getElementById('quality').value = data.quality;
        document.getElementById('listPublic').checked = data.listPublic !== false;
        markPreset(data.width, data.height);
        toast('已保存：' + data.width + ' × ' + data.height);
      })
      .catch(function (err) { toast(err.message, true); })
      .finally(function () { btn.disabled = false; });
  }

  function preview() {
    var btn = document.getElementById('preview');
    btn.disabled = true;
    btn.textContent = '生成中…';
    api('preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (data) {
        var box = document.getElementById('previewBox');
        box.innerHTML = '';
        var img = document.createElement('img');
        img.src = data.image;
        box.appendChild(img);
        toast('预览已生成（' + data.width + ' × ' + data.height + '，' + fmtSize(data.size) + '）');
      })
      .catch(function (err) { toast(err.message, true); })
      .finally(function () { btn.disabled = false; btn.textContent = '生成预览'; });
  }

  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('读取文件失败')); };
      reader.readAsDataURL(file);
    });
  }

  function upload(dataUrl) {
    var slot = Number(document.getElementById('slot').value);
    if (!slot || slot < 1 || slot > 100) { toast('槽位需在 1–100 之间', true); return; }
    var btn = document.getElementById('pickFile');
    btn.disabled = true;
    api('backgrounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: slot, dataUrl: dataUrl })
    })
      .then(function (data) {
        toast('槽位 ' + data.slot + ' 已更新（' + data.ext + '，' + fmtSize(data.size) + '）');
        document.getElementById('fileName').textContent = '未选择文件';
        document.getElementById('file').value = '';
        return loadBackgrounds();
      })
      .catch(function (err) { toast(err.message, true); })
      .finally(function () { btn.disabled = false; });
  }

  function uploadByUrl() {
    var url = document.getElementById('url').value.trim();
    var slot = Number(document.getElementById('slot').value);
    if (!url) { toast('请填写图片地址', true); return; }
    if (!slot || slot < 1 || slot > 100) { toast('槽位需在 1–100 之间', true); return; }
    api('backgrounds/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: slot, url: url })
    })
      .then(function (data) {
        toast('槽位 ' + data.slot + ' 已更新（' + fmtSize(data.size) + '）');
        document.getElementById('url').value = '';
        return loadBackgrounds();
      })
      .catch(function (err) { toast(err.message, true); });
  }

  document.getElementById('presets').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    document.getElementById('width').value = b.dataset.w;
    document.getElementById('height').value = b.dataset.h;
    markPreset(b.dataset.w, b.dataset.h);
  });

  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('preview').addEventListener('click', preview);
  document.getElementById('addByUrl').addEventListener('click', uploadByUrl);
  document.getElementById('pickFile').addEventListener('click', function () {
    document.getElementById('file').click();
  });

  document.getElementById('file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    document.getElementById('fileName').textContent = file.name + ' · ' + fmtSize(file.size);
    readAsDataURL(file).then(upload).catch(function (err) { toast(err.message, true); });
  });

  loadSettings().catch(function (err) { toast(err.message, true); });
  loadBackgrounds().catch(function (err) { toast(err.message, true); });
})();
<\/script>
</body>
</html>`;

export { adminPageHtml };