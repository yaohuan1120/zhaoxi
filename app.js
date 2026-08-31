const key = 'zhaoxi-planner-v1';
const now = new Date();
const todayKey = toDateKey(now);
let activeDate = new Date(now.getFullYear(), now.getMonth(), 1);
let data = loadData();
let journalDateKey = todayKey;
let journalWasTravelled = false;
let draggingTaskId = null;
const themeKeys = ['blue', 'mint', 'lavender', 'yellow', 'pink', 'orange', 'cyan', 'dark'];

function selectedTheme() { return themeKeys.includes(data.theme) ? data.theme : 'blue'; }
function applyTheme(theme = selectedTheme()) {
  const resolvedTheme = themeKeys.includes(theme) ? theme : 'blue';
  document.documentElement.dataset.theme = resolvedTheme;
  document.querySelectorAll('[data-theme-choice]').forEach(button => {
    const active = button.dataset.themeChoice === resolvedTheme;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function toDateKey(date) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10); }
function dateFromKey(value) { return new Date(`${value}T00:00:00`); }
function loadData() {
  const saved = localStorage.getItem(key);
  if (saved) {
    const parsed = JSON.parse(saved);
    parsed.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    parsed.deadlines = Array.isArray(parsed.deadlines) ? parsed.deadlines : [];
    parsed.logs = Array.isArray(parsed.logs) ? parsed.logs : [];
    const cleanedTasks = parsed.tasks.filter(task => !(task.title === '试验' && task.date === '2026-08-31' && task.startTime === '09:23' && task.endTime === '23:18'));
    let dataMigrated = cleanedTasks.length !== parsed.tasks.length;
    cleanedTasks.forEach(task => { if (!task.bucket) { task.bucket = task.date ? 'recent' : 'longterm'; dataMigrated = true; } });
    ['recent','longterm'].forEach(bucket=>cleanedTasks.filter(task => !task.date && task.bucket === bucket).forEach((task, index) => {
      if (!Number.isFinite(task.manualOrder)) { task.manualOrder = index; dataMigrated = true; }
    }));
    if (dataMigrated) {
      parsed.tasks = cleanedTasks;
      localStorage.setItem(key, JSON.stringify(parsed));
    }
    return parsed;
  }
  const year = now.getFullYear(), month = String(now.getMonth() + 1).padStart(2, '0'), day = String(now.getDate()).padStart(2, '0');
  const deadlineEndDate = new Date(now); deadlineEndDate.setDate(deadlineEndDate.getDate() + 6);
  return { tasks: [
    {id: crypto.randomUUID(), title: '整理本周课程资料', date: `${year}-${month}-${day}`, startTime: '', endTime: '', done: false, notes: '', bucket: 'recent'},
    {id: crypto.randomUUID(), title: '联系导师确认选题方向', date: `${year}-${month}-${day}`, startTime: '14:30', endTime: '15:00', done: false, notes: '', bucket: 'recent'},
    {id: crypto.randomUUID(), title: '准备下周阅读清单', date: '', startTime: '', endTime: '', done: false, notes: '', manualOrder: 0, bucket: 'longterm'}
  ], deadlines: [{id: crypto.randomUUID(), title: '选课开放时间', start: `${year}-${month}-${day}T09:00`, end: `${toDateKey(deadlineEndDate)}T16:00`, notes: ''}], logs: [] };
}
function persist() { localStorage.setItem(key, JSON.stringify(data)); }
function save() { persist(); render(); }
function formatCN(date) { return new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(date); }
function formatShort(dateString) { return new Intl.DateTimeFormat('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(dateString)); }
function formatJournalDate(key) { return new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(dateFromKey(key)); }
function escapeHTML(str) { return str.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function getTodayTasks() { return data.tasks.filter(t => t.date === todayKey); }
function taskBucket(task) { return task.bucket === 'longterm' ? 'longterm' : 'recent'; }
function sortTasks(tasks) { return [...tasks].sort((a,b) => { const group=task=>task.date?(task.startTime?0:1):2,groupDiff=group(a)-group(b); if(groupDiff)return groupDiff;if(a.date&&b.date)return `${a.date}T${a.startTime||'23:59'}`.localeCompare(`${b.date}T${b.startTime||'23:59'}`);return (a.manualOrder ?? 0)-(b.manualOrder ?? 0); }); }
function nextManualOrder(bucket='recent') { return data.tasks.filter(task=>!task.date&&taskBucket(task)===bucket).reduce((max,task)=>Math.max(max,Number.isFinite(task.manualOrder)?task.manualOrder:-1),-1)+1; }
function taskHTML(task) { const draggable=!task.date; const meta=(task.notes||'') ? `<span class="task-meta"><span>${escapeHTML(task.notes)}</span></span>` : ''; const schedule=task.date||task.startTime ? `<span class="task-schedule-time ${task.startTime?'':'date-only'}"><span class="task-date-inline">${task.date ? task.date.slice(5).replace('-','/') : ''}</span><span class="task-time-inline">${task.startTime ? `${task.startTime}${task.endTime ? ` – ${task.endTime}` : ''}` : ''}</span></span>` : ''; return `<div class="task-item ${task.done ? 'done' : ''}" data-task-id="${task.id}" data-task-bucket="${taskBucket(task)}" draggable="${draggable}"><input class="check" type="checkbox" data-id="${task.id}" ${task.done ? 'checked' : ''}/><div class="task-main"><span class="task-title">${escapeHTML(task.title)}</span>${meta}</div>${schedule}<button class="delete-item" data-delete="${task.id}" aria-label="删除事项">×</button></div>`; }
function countdown(end) { const diff = new Date(end) - new Date(); if(diff <= 0) return '已结束'; const d=Math.floor(diff/864e5),h=Math.floor(diff%864e5/36e5),m=Math.floor(diff%36e5/6e4); return d ? `还剩 ${d} 天 ${h} 小时` : `还剩 ${h} 小时 ${m} 分钟`; }
function renderDashboard() {
  const recent = sortTasks(data.tasks.filter(t=>taskBucket(t)==='recent')); const done = recent.filter(t=>t.done).length;
  document.querySelector('#todayTasks').innerHTML = recent.length ? recent.map(taskHTML).join('') : '<p class="empty-copy">暂时没有最近待办。</p>';
  document.querySelector('#todayCount').textContent = `${recent.length} 项`;
  document.querySelector('#progressFill').style.width = recent.length ? `${done/recent.length*100}%` : '0%';
  document.querySelector('#progressCopy').textContent = recent.length ? `已完成 ${done} / ${recent.length} 项，慢慢来。` : '把最近想做的事写下来吧。';
  const long = sortTasks(data.tasks.filter(t=>taskBucket(t)==='longterm')); document.querySelector('#longtermTasks').innerHTML = long.length ? long.map(taskHTML).join('') : '<p class="empty-copy">这里放长期想做的事，可拖拽排序。</p>';
  document.querySelector('#longtermCount').textContent = `${long.length} 项`;
  const activeDeadlines=data.deadlines.filter(d=>new Date(d.end)>new Date()); document.querySelector('#deadlineList').innerHTML = activeDeadlines.length ? activeDeadlines.sort((a,b)=>new Date(a.end)-new Date(b.end)).map(d=>`<article class="deadline-card deadline-item" data-deadline-id="${d.id}" title="单击编辑时间段"><div class="deadline-row"><span class="countdown">${countdown(d.end)}</span><strong>${escapeHTML(d.title)}</strong><span class="deadline-meta"><small>${d.start.slice(5,16).replace('T',' ').replace('-','/')} – ${d.end.slice(5,16).replace('T',' ').replace('-','/')}</small><button class="delete-item" type="button" data-delete-deadline="${d.id}" aria-label="删除时间段" title="删除时间段">×</button></span></div></article>`).join('') : '<p class="empty-copy">暂时没有进行中的重要时间段。</p>';
  const events=sortTasks(data.tasks.filter(t=>taskBucket(t)==='recent'&&!t.done&&t.date&&t.date>=todayKey)).slice(0,3);
  document.querySelector('#upcomingSchedule').innerHTML=events.length ? events.map(t=>`<div class="schedule-row schedule-item" data-task-id="${t.id}"><span class="schedule-date">${t.date.slice(5).replace('-','/')}</span><strong>${escapeHTML(t.title)}</strong><small>${t.startTime?`${t.startTime}${t.endTime?` – ${t.endTime}`:''}`:''}</small></div>`).join(''):'<p class="empty-copy">暂时没有接下来的待办。</p>';
  requestAnimationFrame(syncDashboardTimeAlignment);
}
function syncDashboardTimeAlignment(){
  const upcoming=[...document.querySelectorAll('#upcomingSchedule .schedule-row small')],recent=[...document.querySelectorAll('#todayTasks .task-schedule-time')];
  [...upcoming,...recent].forEach(element=>element.style.transform='');
  if(!upcoming.length||!recent.length)return;
  const scheduleList=document.querySelector('#upcomingSchedule').getBoundingClientRect();
  const deleteButtons=[...document.querySelectorAll('#todayTasks .delete-item')].map(button=>button.getBoundingClientRect().left);
  const deleteBoundary=deleteButtons.length?Math.min(...deleteButtons)-8:Infinity;
  const targetRight=Math.min(scheduleList.right-10,deleteBoundary);
  recent.forEach(group=>group.style.transform=`translateX(${targetRight-group.getBoundingClientRect().right}px)`);
  upcoming.forEach(time=>time.style.transform=`translateX(${targetRight-time.getBoundingClientRect().right}px)`);
}
function isDeadlineOnDate(d, day) { const compare = new Date(`${day}T12:00`); return compare >= new Date(d.start) && compare <= new Date(d.end); }
function renderCalendar() {
  const y=activeDate.getFullYear(), m=activeDate.getMonth(); document.querySelector('#calendarTitle').textContent=`${y}年${m+1}月`;
  const first=new Date(y,m,1), startOffset=(first.getDay()+6)%7, start=new Date(y,m,1-startOffset), grid=[];
  for(let i=0;i<42;i++){ const current=new Date(start);current.setDate(start.getDate()+i);const dKey=toDateKey(current), inMonth=current.getMonth()===m;
    const tasks=sortTasks(data.tasks.filter(t=>t.date===dKey)); const deadlines=data.deadlines.filter(d=>isDeadlineOnDate(d,dKey));
    grid.push(`<div class="calendar-day ${inMonth?'':'outside'} ${dKey===todayKey?'today':''}" data-date="${dKey}" title="点击空白处添加事项"><div class="day-number"><b>${current.getDate()}</b>${dKey===todayKey?'<em>今</em>':''}</div>${deadlines.map(d=>`<div class="calendar-deadline" data-deadline-id="${d.id}" title="单击编辑时间段">${escapeHTML(d.title)}</div>`).join('')}${tasks.filter(t=>!t.startTime).slice(0,2).map(t=>`<div class="calendar-task calendar-item ${t.done?'done':''}" data-task-id="${t.id}"><input class="calendar-check" type="checkbox" data-id="${t.id}" ${t.done?'checked':''}/><span>${escapeHTML(t.title)}</span></div>`).join('')}${tasks.filter(t=>t.startTime).slice(0,2).map(t=>`<div class="calendar-event calendar-item ${t.done?'done':''}" data-task-id="${t.id}"><input class="calendar-check" type="checkbox" data-id="${t.id}" ${t.done?'checked':''}/><span>${t.startTime} ${escapeHTML(t.title)}</span></div>`).join('')}</div>`);
  } document.querySelector('#calendarGrid').innerHTML=grid.join('');
}
function renderJournal() {
  const entry = data.logs.find(log => log.date === journalDateKey);
  const hasContent = Boolean(entry && (entry.title.trim() || entry.content.trim()));
  document.querySelector('#journalDateLabel').textContent = formatJournalDate(journalDateKey);
  document.querySelector('#journalCardDate').textContent = journalDateKey.replaceAll('-', '.');
  document.querySelector('#journalWeekday').textContent = journalDateKey === todayKey
    ? '今日手记'
    : (journalDateKey > todayKey ? '未来手记' : '往日手记');
  document.querySelector('#journalDatePicker').value = journalDateKey;
  document.querySelector('#journalTitleInput').value = entry?.title || '';
  document.querySelector('#journalBodyInput').value = entry?.content || '';
  document.querySelector('#journalSaveStatus').textContent = journalWasTravelled ? '从记忆里抽出了这一页' : (hasContent ? '已保存至此设备的当前浏览器' : '写下的内容会保存在此设备的当前浏览器');
  const stage = document.querySelector('#journalStage');
  stage.classList.toggle('has-content', hasContent);
  stage.classList.toggle('time-travelled', journalWasTravelled);
  bindJournal();
}
function render() { document.querySelector('#todayLabel').textContent=formatCN(new Date()); renderDashboard();renderCalendar();renderJournal();bindDynamic(); }
function bindDynamic(){ document.querySelectorAll('.check,.calendar-check').forEach(e=>e.onchange=()=>{const t=data.tasks.find(t=>t.id===e.dataset.id);t.done=e.checked;save();});document.querySelectorAll('[data-delete]').forEach(e=>e.onclick=()=>{data.tasks=data.tasks.filter(t=>t.id!==e.dataset.delete);save();});document.querySelectorAll('[data-delete-deadline]').forEach(e=>e.onclick=()=>{data.deadlines=data.deadlines.filter(d=>d.id!==e.dataset.deleteDeadline);save();});document.querySelectorAll('.task-item,.schedule-item').forEach(e=>e.onclick=event=>{if(event.target.closest('.check,.delete-item'))return;const task=data.tasks.find(t=>t.id===e.dataset.taskId);if(task)openModal('task','',task);});document.querySelectorAll('.deadline-item').forEach(e=>e.onclick=event=>{if(event.target.closest('.delete-item'))return;const deadline=data.deadlines.find(d=>d.id===e.dataset.deadlineId);if(deadline)openModal('deadline','',deadline);});document.querySelectorAll('.calendar-item').forEach(e=>e.onclick=event=>{if(event.target.closest('.calendar-check'))return;openModal('task','',data.tasks.find(t=>t.id===e.dataset.taskId));});document.querySelectorAll('.calendar-deadline').forEach(e=>e.onclick=()=>{const deadline=data.deadlines.find(d=>d.id===e.dataset.deadlineId);if(deadline)openModal('deadline','',deadline);});document.querySelectorAll('.calendar-day').forEach(day=>day.onclick=event=>{if(event.target.closest('.calendar-item')||event.target.closest('.calendar-deadline'))return;openModal('task',day.dataset.date);});bindTaskDragAndDrop(); }
function bindTaskDragAndDrop(){document.querySelectorAll('.task-item[draggable="true"]').forEach(item=>{item.ondragstart=event=>{draggingTaskId=item.dataset.taskId;item.classList.add('dragging');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggingTaskId);};item.ondragover=event=>{if(!draggingTaskId||draggingTaskId===item.dataset.taskId)return;event.preventDefault();event.dataTransfer.dropEffect='move';item.classList.add('drag-over');};item.ondragleave=()=>item.classList.remove('drag-over');item.ondrop=event=>{event.preventDefault();const sourceId=event.dataTransfer.getData('text/plain')||draggingTaskId,targetId=item.dataset.taskId,bucket=item.dataset.taskBucket;if(!sourceId||sourceId===targetId)return;const unordered=sortTasks(data.tasks.filter(task=>!task.date&&taskBucket(task)===bucket));const sourceIndex=unordered.findIndex(task=>task.id===sourceId),targetIndex=unordered.findIndex(task=>task.id===targetId);if(sourceIndex<0||targetIndex<0)return;const [moved]=unordered.splice(sourceIndex,1);unordered.splice(targetIndex,0,moved);unordered.forEach((task,index)=>task.manualOrder=index);persist();render();};item.ondragend=()=>{draggingTaskId=null;document.querySelectorAll('.task-item').forEach(row=>row.classList.remove('dragging','drag-over'));};});}
function changeJournalDay(offset) { const next = dateFromKey(journalDateKey); next.setDate(next.getDate() + offset); journalDateKey = toDateKey(next); journalWasTravelled = false; renderJournal(); }
function writeJournal() {
  const title = document.querySelector('#journalTitleInput').value.trim();
  const content = document.querySelector('#journalBodyInput').value.trim();
  const existing = data.logs.find(log => log.date === journalDateKey);
  if (title || content) {
    if (existing) Object.assign(existing, {title, content, updatedAt: new Date().toISOString()});
    else data.logs.push({id: crypto.randomUUID(), date: journalDateKey, title, content, updatedAt: new Date().toISOString()});
  } else if (existing) data.logs = data.logs.filter(log => log.date !== journalDateKey);
  persist();
  document.querySelector('#journalStage').classList.toggle('has-content', Boolean(title || content));
  document.querySelector('#journalSaveStatus').textContent = title || content ? '已保存至此设备的当前浏览器' : '写下的内容会保存在此设备的当前浏览器';
}
function bindJournal() {
  document.querySelector('#previousJournalDay').onclick = () => changeJournalDay(-1);
  document.querySelector('#nextJournalDay').onclick = () => changeJournalDay(1);
  document.querySelector('#journalDatePicker').onchange = event => { if (event.target.value) { journalDateKey = event.target.value; journalWasTravelled = false; renderJournal(); } };
  document.querySelector('#journalTitleInput').oninput = writeJournal;
  document.querySelector('#journalBodyInput').oninput = writeJournal;
}
const modal=document.querySelector('#taskModal'), form=document.querySelector('#taskForm');let editingTaskId=null;let editingDeadlineId=null;let editingTaskBucket='recent';
function populateTimeOptions(){document.querySelectorAll('.time-select').forEach(select=>{select.innerHTML='<option value="">选择时间</option>';for(let hour=0;hour<24;hour++){for(const minute of [0,30]){const time=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;select.insertAdjacentHTML('beforeend',`<option value="${time}">${time}</option>`);}}});}
function openLayer(layer){layer.hidden=false;}
function closeLayer(layer){layer.hidden=true;}
function openModal(kind='task', quick='', item=null, bucket='recent') { form.reset();editingTaskId=null;editingDeadlineId=null;editingTaskBucket=kind==='task'?(item?taskBucket(item):bucket):bucket;form.itemType.value=kind;const editing=Boolean(item);document.querySelector('#taskModalTitle').textContent=editing?(kind==='deadline'?'编辑时间段':'编辑事项'):(kind==='deadline'?'添加时间段':'添加一个事项');form.querySelector('button[type="submit"]').textContent=editing?'保存修改':(kind==='deadline'?'保存时间段':'保存事项');document.querySelectorAll('.choice-card').forEach(x=>x.classList.toggle('active',x.querySelector('input').value===kind));if(item&&kind==='deadline'){editingDeadlineId=item.id;form.title.value=item.title;[form.deadlineStartDate.value,form.deadlineStartTime.value]=item.start.split('T');[form.deadlineEndDate.value,form.deadlineEndTime.value]=item.end.split('T');form.notes.value=item.notes||'';}else if(item){editingTaskId=item.id;form.title.value=item.title;form.date.value=item.date;form.startTime.value=item.startTime;form.endTime.value=item.endTime;form.notes.value=item.notes||'';}syncModalFields();if(quick==='today')form.date.value=todayKey;else if(quick)form.date.value=quick;openLayer(modal);form.title.focus();}
function syncModalFields(){const isDeadline=form.itemType.value==='deadline';document.querySelector('#timeFields').classList.toggle('hidden',isDeadline);document.querySelector('#deadlineFields').classList.toggle('hidden',!isDeadline);}
document.querySelector('#openDeadlineModal').onclick=()=>openModal('deadline');document.querySelectorAll('.add-inline').forEach(e=>e.onclick=()=>openModal('task',e.dataset.quickDate,'',e.dataset.taskBucket||'recent'));form.itemType.forEach(e=>e.onchange=()=>{document.querySelectorAll('.choice-card').forEach(x=>x.classList.toggle('active',x.querySelector('input').checked));syncModalFields();});
function clearTimeValidation(){document.querySelector('#timeValidation').hidden=true;document.querySelectorAll('.time-invalid').forEach(field=>field.classList.remove('time-invalid'));}
function showTimeValidation(message, fieldNames){const notice=document.querySelector('#timeValidation');notice.textContent=message;notice.hidden=false;fieldNames.forEach(name=>form.elements[name]?.classList.add('time-invalid'));}
form.addEventListener('submit',e=>{e.preventDefault();clearTimeValidation();const f=new FormData(form);if(f.get('itemType')==='deadline'){if(!f.get('deadlineStartDate')||!f.get('deadlineStartTime')||!f.get('deadlineEndDate')||!f.get('deadlineEndTime')){showTimeValidation('请填写开始和结束日期与时间。',['deadlineStartDate','deadlineStartTime','deadlineEndDate','deadlineEndTime']);return;}const start=`${f.get('deadlineStartDate')}T${f.get('deadlineStartTime')}`,end=`${f.get('deadlineEndDate')}T${f.get('deadlineEndTime')}`;if(new Date(end)<=new Date(start)){showTimeValidation('结束日期和时间必须晚于开始日期和时间。',['deadlineStartDate','deadlineStartTime','deadlineEndDate','deadlineEndTime']);return;}const payload={title:f.get('title').trim(),start,end,notes:f.get('notes').trim()};const editingDeadline=editingDeadlineId&&data.deadlines.find(d=>d.id===editingDeadlineId);if(editingDeadline)Object.assign(editingDeadline,payload);else data.deadlines.push({id:crypto.randomUUID(),...payload});}else{const startTime=f.get('startTime'),endTime=f.get('endTime');if(startTime&&endTime&&endTime<=startTime){showTimeValidation('结束时间必须晚于开始时间。',['startTime','endTime']);return;}const payload={title:f.get('title').trim(),date:f.get('date'),startTime,endTime,notes:f.get('notes').trim()};const editingTask=editingTaskId&&data.tasks.find(t=>t.id===editingTaskId);if(editingTask){if(!payload.date&&!Number.isFinite(editingTask.manualOrder))payload.manualOrder=nextManualOrder(editingTaskBucket);Object.assign(editingTask,payload,{bucket:editingTaskBucket});}else data.tasks.push({id:crypto.randomUUID(),...payload,done:false,bucket:editingTaskBucket,manualOrder:payload.date?undefined:nextManualOrder(editingTaskBucket)});}closeLayer(modal);save();});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.querySelectorAll('.nav-item').forEach(v=>v.classList.remove('active'));document.querySelector(`#${b.dataset.view}View`).classList.add('active');document.querySelectorAll(`[data-view="${b.dataset.view}"]`).forEach(x=>x.classList.add('active'));document.body.classList.toggle('calendar-mode',b.dataset.view==='calendar');document.body.classList.toggle('journal-mode',b.dataset.view==='journal');document.body.classList.remove('mobile-nav-open');window.scrollTo({top:0,behavior:'smooth'});});
document.querySelector('#prevMonth').onclick=()=>{activeDate.setMonth(activeDate.getMonth()-1);renderCalendar();};document.querySelector('#nextMonth').onclick=()=>{activeDate.setMonth(activeDate.getMonth()+1);renderCalendar();};document.querySelector('#jumpToday').onclick=()=>{activeDate=new Date(now.getFullYear(),now.getMonth(),1);renderCalendar();};
document.querySelector('#timeTravelButton').onclick=()=>{const written=data.logs.filter(log=>log.title.trim()||log.content.trim());if(!written.length){journalDateKey=todayKey;journalWasTravelled=false;renderJournal();document.querySelector('#journalSaveStatus').textContent='还没有往日的日志，先从今天写起吧';return;}const choices=written.length>1?written.filter(log=>log.date!==journalDateKey):written;const picked=choices[Math.floor(Math.random()*choices.length)];journalDateKey=picked.date;journalWasTravelled=true;renderJournal();};
document.querySelector('#presentButton').onclick=()=>{journalDateKey=todayKey;journalWasTravelled=false;renderJournal();};
document.querySelector('#settingsButton').onclick=()=>openLayer(document.querySelector('#settingsModal'));
document.querySelectorAll('[data-theme-choice]').forEach(button=>button.onclick=()=>{data.theme=button.dataset.themeChoice;persist();applyTheme(data.theme);});
document.querySelector('.mobile-menu').onclick=()=>document.body.classList.toggle('mobile-nav-open');
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>closeLayer(button.closest('.modal-layer'))));
document.querySelectorAll('.modal-layer').forEach(layer=>layer.addEventListener('pointerdown',event=>{if(event.target===layer) closeLayer(layer);}));
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.modal-layer:not([hidden])').forEach(closeLayer);});
populateTimeOptions();
applyTheme();
render();
setInterval(()=>{renderDashboard();bindDynamic();},60000);
let alignmentFrame;
window.addEventListener('resize',()=>{cancelAnimationFrame(alignmentFrame);alignmentFrame=requestAnimationFrame(syncDashboardTimeAlignment);});
