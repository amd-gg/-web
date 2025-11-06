// ===== 简易数据层（localStorage） =====
const DB_KEY = 'lf_app_db_v1';

const nowISO = () => new Date().toISOString();
const uid = (p='id_') => p + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
const fmt = (iso) => new Date(iso).toLocaleString();

const readDB = () => {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const seed = {
      users: [
        { id:'u_admin', username:'admin', password:'admin123', wechat:'weixin-admin', avatar:'', createdAt:nowISO() }
      ],
      session: { userId:'' },
      posts: [
        {
          id: uid('p_'),
          type:'found',
          title:'校图书馆二楼拾到校园卡1张',
          content:'今天下午在图书馆二楼座位区捡到校园卡，背后名字“李同学”。\n可留言或私聊联系。',
          place:'图书馆二楼',
          image:'',
          authorId:'u_admin',
          createdAt: nowISO()
        },
        {
          id: uid('p_'),
          type:'lost',
          title:'求助：丢失黑色雨伞',
          content:'晚自习后从东门到宿舍途中遗失黑色折叠伞，若捡到请联系，感谢！',
          place:'东门到宿舍路上',
          image:'',
          authorId:'u_admin',
          createdAt: nowISO()
        }
      ],
      comments: {}, // postId -> [] of {id,userId,content,createdAt}
      messages: {}  // threadKey -> [] of {fromId,toId,content,createdAt}
    };
    localStorage.setItem(DB_KEY, JSON.stringify(seed));
    return seed;
  }
  return JSON.parse(raw);
};
const writeDB = (db) => localStorage.setItem(DB_KEY, JSON.stringify(db));
const DB = {
  get(){ return readDB(); },
  set(d){ writeDB(d); },
  patch(patch){ const d=readDB(); writeDB({...d, ...patch}); },
};

// ===== 业务服务 =====
const Auth = {
  me(){
    const db = DB.get();
    return db.users.find(u => u.id === db.session.userId) || null;
  },
  login({username,password}){
    const db = DB.get();
    const u = db.users.find(x => x.username === username && x.password === password);
    if (!u) throw new Error('用户名或密码错误');
    db.session.userId = u.id;
    DB.set(db);
    return u;
  },
  logout(){
    const db = DB.get();
    db.session.userId = '';
    DB.set(db);
  },
  register({username,password,wechat}){
    const db = DB.get();
    if (db.users.some(u=>u.username===username)) throw new Error('用户名已存在');
    const u = { id: uid('u_'), username, password, wechat, avatar:'', createdAt: nowISO() };
    db.users.push(u);
    db.session.userId = u.id;
    DB.set(db);
    return u;
  },
  resetPassword({username,wechat,newPassword}){
    const db = DB.get();
    const u = db.users.find(x=>x.username===username && x.wechat===wechat);
    if (!u) throw new Error('用户名与微信号不匹配');
    u.password = newPassword;
    DB.set(db);
  }
};

const Store = {
  listPosts({type='all', query=''}) {
    const db = DB.get();
    let res = [...db.posts];
    if (type !== 'all') res = res.filter(p => p.type === type);
    if (query.trim()){
      const q = query.trim().toLowerCase();
      res = res.filter(p =>
        [p.title, p.content, p.place].some(x => (x||'').toLowerCase().includes(q))
      );
    }
    return res.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  getPost(id){
    return DB.get().posts.find(p=>p.id===id) || null;
  },
  createPost({type,title,content,place,image}){
    const me = Auth.me();
    if (!me) throw new Error('请先登录再发布');
    if (!title || !content || !type) throw new Error('标题/正文/类型为必填');
    const db = DB.get();
    const post = { id:uid('p_'), type, title, content, place: place||'', image: image||'', authorId: me.id, createdAt: nowISO() };
    db.posts.push(post);
    DB.set(db);
    return post;
  },
  addComment(postId, content){
    const me = Auth.me();
    if (!me) throw new Error('请先登录再评论');
    const db = DB.get();
    if (!db.comments[postId]) db.comments[postId] = [];
    db.comments[postId].push({ id:uid('c_'), userId:me.id, content, createdAt: nowISO() });
    DB.set(db);
  },
  listComments(postId){
    const db = DB.get();
    const arr = db.comments[postId] || [];
    return arr.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  },
  threadKey(a,b){ return [a,b].sort().join('__'); },
  listMessages(peerId){
    const me = Auth.me(); if(!me) throw new Error('未登录');
    const key = Store.threadKey(me.id, peerId);
    const db = DB.get();
    return db.messages[key] || [];
  },
  sendMessage(peerId, content){
    const me = Auth.me(); if(!me) throw new Error('未登录');
    const key = Store.threadKey(me.id, peerId);
    const db = DB.get();
    if(!db.messages[key]) db.messages[key]=[];
    db.messages[key].push({fromId:me.id, toId:peerId, content, createdAt:nowISO()});
    DB.set(db);
  },
  userById(id){ return DB.get().users.find(u=>u.id===id) || null; }
};

// ===== 视图层与路由 =====
const qs = (sel,root=document)=>root.querySelector(sel);
const qsa = (sel,root=document)=>Array.from(root.querySelectorAll(sel));

const Router = {
  go(path){
    const newHash = '#' + (path.startsWith('/')?path.slice(1):path);
    const same = location.hash === newHash;
    location.hash = newHash;
    if (same) App.render(); // 兜底：hash 未变化时也强制渲染
  },
  onChange(){ App.render(); }
};

window.addEventListener('hashchange', Router.onChange);
window.addEventListener('load', Router.onChange); // 兜底：初始/刷新后也触发一次

// ===== App 入口与事件 =====
const App = {
  state: { type:'all', query:'' },

  init(){
    // Header actions
    qs('#searchBtn').addEventListener('click', ()=>{
      this.state.query = qs('#searchInput').value || '';
      this.renderList();
    });
    qs('#searchInput').addEventListener('keydown', (e)=>{
      if(e.key==='Enter'){ qs('#searchBtn').click(); }
    });

    qsa('.tab').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        qsa('.tab').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        this.state.type = btn.dataset.type;
        this.renderList();
      });
    });

    const goPublish = ()=>{ Router.go('/publish'); App.render(); }; // 双保险：立即渲染
    qs('#publishBtn').addEventListener('click', goPublish);
    qs('#fabPublish').addEventListener('click', goPublish);

    // login / me
    qs('#loginEntryBtn').addEventListener('click', ()=>{
      const me = Auth.me();
      if(me) Router.go('/me'); else openAuth('login');
    });

    // Auth dialog wiring
    wireAuthDialog();

    this.render(); // initial
  },

  render(){
    // set login button text
    const me = Auth.me();
    qs('#loginEntryBtn').textContent = me ? '我的' : '登录';

    const hash = location.hash.replace(/^#/, '');
    if (!hash || hash === '/') {
      this.renderList();
      return;
    }
    if (hash.startsWith('/publish')) { this.renderPublish(); return; }
    if (hash.startsWith('/post/')) { this.renderDetail(hash.split('/')[2]); return; }
    if (hash.startsWith('/me')) { this.renderMe(); return; }
    // default
    this.renderList();
  },

  renderList(){
    const view = qs('#view');
    const posts = Store.listPosts({type:this.state.type, query:this.state.query});

    const html = `
      <section class="list">
        ${posts.map(p=>PostCard(p)).join('')}
      </section>
      ${posts.length===0? `<div class="empty">暂无数据，试试更换筛选或搜索关键词</div>`:''}
    `;
    view.innerHTML = html;

    // Bind click
    qsa('[data-post-id]').forEach(el=>{
      el.addEventListener('click', ()=> { Router.go('/post/'+ el.dataset.postId); App.render(); });
    });
  },

  renderPublish(){
    const me = Auth.me();
    const view = qs('#view');
    if (!me){
      view.innerHTML = `<div class="card"><p>请先登录后再发布。</p><button class="btn" id="goLogin">去登录</button></div>`;
      qs('#goLogin').addEventListener('click', ()=>openAuth('login'));
      return;
    }

    view.innerHTML = `
      <section class="card">
        <h3>发布信息</h3>
        <div class="field">
          <label>类型 <span class="form-tip">必选</span></label>
          <select id="f_type">
            <option value="">请选择</option>
            <option value="found">发现（失物招领）</option>
            <option value="lost">求助（寻物启事）</option>
          </select>
        </div>
        <div class="field">
          <label>标题 <span class="form-tip">简洁明了</span></label>
          <input id="f_title" placeholder="如：拾到校园卡 / 寻找黑色雨伞" />
        </div>
        <div class="field">
          <label>正文</label>
          <textarea id="f_content" placeholder="描述时间、地点、特征、联系方式等"></textarea>
        </div>
        <div class="field">
          <label>地点</label>
          <input id="f_place" placeholder="如：图书馆二楼、自习室、操场看台" />
        </div>
        <div class="field">
          <label>图片（可选）</label>
          <input id="f_image" type="file" accept="image/*" />
          <img id="f_preview" alt="" style="max-width:100%;border-radius:12px;display:none;margin-top:8px"/>
        </div>
        <div class="row gap">
          <button class="btn" id="publishSubmit">发布</button>
          <button class="btn btn-ghost" id="backHome">返回首页</button>
        </div>
      </section>
    `;

    const file = qs('#f_image');
    file.addEventListener('change', async (e)=>{
      const img = e.target.files?.[0];
      if(!img) return;
      const b64 = await toBase64(img);
      const pv = qs('#f_preview');
      pv.src = b64; pv.style.display='block';
      pv.dataset.b64 = b64;
    });

    qs('#publishSubmit').addEventListener('click', ()=>{
      const type = qs('#f_type').value;
      const title = qs('#f_title').value.trim();
      const content = qs('#f_content').value.trim();
      const place = qs('#f_place').value.trim();
      const image = qs('#f_preview').dataset.b64 || '';
      try{
        const p = Store.createPost({type,title,content,place,image});
        alert('发布成功');
        Router.go('/post/'+p.id);
      }catch(err){ alert(err.message || String(err)); }
    });
    qs('#backHome').addEventListener('click', ()=>Router.go('/'));
  },

  renderDetail(id){
    const post = Store.getPost(id);
    const view = qs('#view');
    if (!post){ view.innerHTML = `<div class="empty">帖子不存在或已删除</div>`; return; }
    const author = Store.userById(post.authorId);
    const me = Auth.me();

    view.innerHTML = `
      <article class="card detail">
        <div class="header">
          <div class="row gap">
            <span class="badge ${post.type}">${post.type==='found'?'失物招领':'寻物启事'}</span>
            <div class="meta">发布于 ${fmt(post.createdAt)} · 作者 ${author?.username||'未知'}</div>
          </div>
          <h2>${escapeHTML(post.title)}</h2>
          ${post.image ? `<img class="cover" src="${post.image}" alt="图片" />` : ``}
        </div>

        <div class="content">${escapeHTML(post.content)}</div>

        <div class="kv" style="margin-top:10px">
          <div><b>地点：</b>${escapeHTML(post.place||'未填写')}</div>
          <div><b>作者微信：</b>${escapeHTML(author?.wechat||'未留')}</div>
        </div>

        <div class="actions">
          <button class="btn" id="commentFocus">评论</button>
          <button class="btn btn-ghost" id="chatBtn">私聊作者</button>
          <button class="btn btn-ghost" onclick="Router.go('/')">返回</button>
        </div>

        <section class="comments">
          <h3>评论</h3>
          <div id="c_list">${CommentsList(id)}</div>
          <div class="row gap" style="margin-top:8px">
            <input id="c_input" placeholder="${me?'说点什么...':'登录后才能评论'}" ${me?'':'disabled'} />
            <button id="c_send" class="btn" ${me?'':'disabled'}>发送</button>
          </div>
        </section>
      </article>
    `;

    qs('#c_send').addEventListener('click', ()=>{
      const v = qs('#c_input').value.trim();
      if(!v) return;
      try{
        Store.addComment(id, v);
        qs('#c_input').value = '';
        qs('#c_list').innerHTML = CommentsList(id);
      }catch(err){ alert(err.message || String(err)); }
    });
    qs('#commentFocus').addEventListener('click', ()=>qs('#c_input')?.focus());

    qs('#chatBtn').addEventListener('click', ()=>{
      const me = Auth.me();
      if (!me){ openAuth('login'); return; }
      openChat(post.authorId);
    });
  },

  renderMe(){
    const me = Auth.me();
    const view = qs('#view');
    if(!me){
      view.innerHTML = `<div class="card"><p>尚未登录</p><button class="btn" id="goLogin2">去登录</button></div>`;
      qs('#goLogin2').addEventListener('click', ()=>openAuth('login'));
      return;
    }
    const myPosts = Store.listPosts({type:'all', query:''}).filter(p=>p.authorId===me.id);
    view.innerHTML = `
      <section class="card">
        <h3>我的资料</h3>
        <div class="kv">
          <div><b>用户名：</b>${escapeHTML(me.username)}</div>
          <div><b>微信号：</b>${escapeHTML(me.wechat||'未填写')}</div>
          <div><b>注册时间：</b>${fmt(me.createdAt)}</div>
        </div>
        <div class="row gap" style="margin-top:8px">
          <button class="btn btn-ghost" id="logoutBtn">退出登录</button>
          <button class="btn" id="toPublish">去发布</button>
          <button class="btn btn-ghost" onclick="Router.go('/')">返回首页</button>
        </div>
      </section>

      <section style="margin-top:12px">
        <h3 style="margin:8px 0">我发布的</h3>
        <div class="list">${myPosts.map(PostCard).join('') || `<div class="empty card">暂无发布</div>`}</div>
      </section>
    `;
    qs('#logoutBtn').addEventListener('click', ()=>{ Auth.logout(); Router.go('/'); });
    qs('#toPublish').addEventListener('click', ()=>Router.go('/publish'));
    qsa('[data-post-id]').forEach(el=>el.addEventListener('click', ()=>Router.go('/post/'+el.dataset.postId)));
  }
};

// ===== 组件 =====
function PostCard(p){
  const author = Store.userById(p.authorId);
  return `
    <article class="card post-card pointer" data-post-id="${p.id}" title="查看详情">
      <div class="row gap">
        <span class="badge ${p.type}">${p.type==='found'?'失物招领':'寻物启事'}</span>
        <div class="meta">发布于 ${fmt(p.createdAt)} · ${escapeHTML(author?.username||'未知')}</div>
      </div>
      <div class="title" style="margin-top:6px">${escapeHTML(p.title)}</div>
      ${p.image? `<img class="cover" src="${p.image}" alt="图片" />`:``}
      <div class="muted small" style="margin-top:6px">地点：${escapeHTML(p.place||'未填写')}</div>
    </article>
  `;
}

function CommentsList(postId){
  const arr = Store.listComments(postId);
  if (arr.length===0) return `<div class="muted small">暂无评论</div>`;
  return arr.map(c=>{
    const u = Store.userById(c.userId);
    return `
      <div class="comment">
        <div class="small muted">${fmt(c.createdAt)}</div>
        <div><span class="who">${escapeHTML(u?.username||'有人')}：</span>${escapeHTML(c.content)}</div>
      </div>
    `;
  }).join('');
}

// ===== 工具 UI：验证码、图片转base64、转义 =====
function randomCaptcha(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for(let i=0;i<4;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function toBase64(file){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}
function escapeHTML(str=''){
  return str.replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

// ===== Auth 对话框逻辑 =====
function wireAuthDialog(){
  const dialog = qs('#authDialog');
  const cancelBtn = document.getElementById('authCancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => dialog.close('cancel'));

  const captchaText = qs('#captchaText');
  const refresh = ()=> captchaText.textContent = randomCaptcha();
  refresh();
  qs('#refreshCaptcha').addEventListener('click', refresh);

  // 切换面板
  const regPanel = qs('#registerPanel');
  const resetPanel = qs('#resetPanel');
  const setMode = (mode)=>{
    qs('#authTitle').textContent = mode==='login' ? '登录' : mode==='register' ? '注册' : '找回/重置密码';
    regPanel.hidden = mode!=='register';
    resetPanel.hidden = mode!=='reset';
  };

  qs('#toRegister').addEventListener('click', ()=> setMode('register'));
  qs('#backToLogin').addEventListener('click', ()=> setMode('login'));
  qs('#toReset').addEventListener('click', ()=> setMode('reset'));
  qs('#backToLogin2').addEventListener('click', ()=> setMode('login'));

  // 登录
  qs('#authSubmit').addEventListener('click', (e)=>{
    e.preventDefault();
    const f = new FormData(qs('#authForm'));
    const username = f.get('username')?.toString().trim();
    const password = f.get('password')?.toString();
    const captcha = f.get('captcha')?.toString().trim().toUpperCase();
    if (captcha !== captchaText.textContent) { alert('验证码错误'); refresh(); return; }
    try{
      Auth.login({username,password});
      dialog.close();
      App.render();
    }catch(err){
      alert(err.message || String(err));
      refresh();
    }
  });

  // 注册
  qs('#registerSubmit').addEventListener('click', ()=>{
    const f = new FormData(qs('#authForm'));
    const username = f.get('username')?.toString().trim();
    const password = f.get('reg_password')?.toString();
    const wechat = f.get('reg_wechat')?.toString().trim();
    if(!username || !password) { alert('请填写用户名和密码'); return; }
    try{
      Auth.register({username,password,wechat});
      dialog.close();
      App.render();
    }catch(err){ alert(err.message || String(err)); }
  });

  // 重置密码
  qs('#resetSubmit').addEventListener('click', ()=>{
    const f = new FormData(qs('#authForm'));
    const username = f.get('username')?.toString().trim();
    const newPassword = f.get('reset_password')?.toString();
    const wechat = f.get('reset_wechat')?.toString().trim();
    if(!username || !newPassword || !wechat){ alert('请完整填写信息'); return; }
    try{
      Auth.resetPassword({username,wechat,newPassword});
      alert('重置成功，请使用新密码登录');
      setMode('login');
    }catch(err){ alert(err.message || String(err)); }
  });

  // 暴露打开函数
  window.openAuth = (mode='login')=>{
    setMode(mode);
    refresh();
    dialog.showModal();
  };
}

// ===== Chat 模态框逻辑 =====
function openChat(peerUserId){
  const me = Auth.me();
  if(!me) return openAuth('login');
  const peer = Store.userById(peerUserId);
  const dialog = qs('#chatDialog');
  qs('#chatMeta').innerHTML = `与 <b>${escapeHTML(peer?.username||'用户')}</b> 对话 · 对方微信：${escapeHTML(peer?.wechat||'未留')}`;

  const renderChat = ()=>{
    const list = Store.listMessages(peerUserId);
    const meId = me.id;
    qs('#chatList').innerHTML = list.map(msg=>{
      const cls = msg.fromId===meId ? 'me' : 'other';
      return `<div class="msg ${cls}"><div class="bubble small">${escapeHTML(msg.content)}<div class="muted small">${fmt(msg.createdAt)}</div></div></div>`;
    }).join('');
    const box = qs('#chatList');
    box.scrollTop = box.scrollHeight;
  };

  renderChat();
  qs('#chatSendBtn').onclick = ()=>{
    const v = qs('#chatInput').value.trim();
    if(!v) return;
    Store.sendMessage(peerUserId, v);
    qs('#chatInput').value = '';
    renderChat();
  };

  dialog.showModal();
}

// ===== 启动应用 =====
window.addEventListener('DOMContentLoaded', ()=>{
  App.init();
});
