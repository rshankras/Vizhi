import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import { CodexSessionHistory, isSessionId } from "./codex-session-history.js";
import { DEFAULT_PROMPT_TEMPLATES, getFavoriteTemplate, getPromptTemplate, isPromptTemplateId, PROMPT_TEMPLATE_IDS } from "./prompt-template.js";
import { StateStore } from "./state-store.js";
import { GRID_SLOT_COUNT, TERMINAL_KEYS, type Action, type GridSnapshot, type SessionHistoryEntry } from "./types.js";
import { CONVERSATION_POLICY, SESSION_NUMBER_WORDS, summarizeForSpeech, VOICE_INTENTS } from "./voice-intents.js";

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vizhi — Virtual Deck</title><style>
:root{color-scheme:dark;font-family:ui-rounded,system-ui,-apple-system,BlinkMacSystemFont,sans-serif;background:#0b1117;color:#eef5f4}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#142a31 0,#0b1117 42rem);padding:28px 16px}.shell{width:min(1120px,100%);margin:0 auto}header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:20px}h1{font-size:1rem;margin:0;letter-spacing:.13em}.eyebrow{display:block;color:#7ee9dc;font-size:.7rem;letter-spacing:.12em;margin-bottom:4px}.meta{color:#9aabaa;font-size:.8rem;text-align:right}.session-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.session{min-height:128px;border:1px solid #263b43;border-radius:14px;background:linear-gradient(145deg,#15232b,#0d151b);padding:13px;text-align:left;color:inherit;cursor:pointer;box-shadow:0 8px 20px #0003;transition:transform .15s,border-color .15s,background .15s}.session:hover{transform:translateY(-2px);border-color:#65d5e2}.session.selected{border-color:#60a5fa;box-shadow:0 0 0 2px #60a5fa38,0 8px 20px #0004}.session.empty{opacity:.3;cursor:default}.session[data-state="waiting"]{border-color:#f5b33c;background:linear-gradient(145deg,#352b17,#181817)}.session[data-risk="high"]{border-color:#ff6666;background:linear-gradient(145deg,#402025,#1b1418);animation:pulse 1.8s ease-in-out infinite}.session-title{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:1rem;font-weight:700}.slot{font-size:.65rem;color:#7ee9dc;letter-spacing:.1em}.session-state{margin-top:27px;font-size:.67rem;letter-spacing:.1em;text-transform:uppercase;color:#a9c1c0}.session-ctx{margin-top:5px;color:#8fa4a7;font-size:.76rem}.workspace{display:grid;grid-template-columns:minmax(230px,.9fr) minmax(0,2.1fr);gap:14px;margin-top:14px}.panel{border:1px solid #263b43;border-radius:16px;background:#101a20cc;padding:16px;box-shadow:0 8px 28px #0003}.panel-heading{margin:0 0 11px;font-size:.72rem;text-transform:uppercase;letter-spacing:.12em;color:#8fa4a7}.selected-project{font-size:1.25rem;font-weight:750}.selected-status{margin-top:6px;color:#7ee9dc;font-size:.8rem;text-transform:uppercase;letter-spacing:.1em}.usage{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:18px}.metric{padding:9px;border-radius:10px;background:#0c141a}.metric span{display:block;color:#81969a;font-size:.63rem;letter-spacing:.08em;text-transform:uppercase}.metric strong{display:block;margin-top:3px;font-size:.86rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.activity{margin:16px 0 0;color:#d9e8e5;font-size:.82rem;line-height:1.4}.controls{display:grid;gap:12px}.control-group{padding-bottom:12px;border-bottom:1px solid #22343b}.control-group:last-child{border-bottom:0;padding-bottom:0}.control-label{display:block;margin-bottom:8px;color:#8fa4a7;font-size:.66rem;text-transform:uppercase;letter-spacing:.1em}.button-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:7px}.control{min-height:44px;border:1px solid #304851;border-radius:10px;background:#17262d;color:#e8f1f0;padding:7px 9px;font:inherit;font-size:.78rem;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}.control:hover:not(:disabled){background:#20353d;border-color:#72d9d2;transform:translateY(-1px)}.control:disabled{opacity:.35;cursor:not-allowed}.control.positive{border-color:#237b53;color:#a7f3c6}.control.negative{border-color:#8d4148;color:#fecaca}.control.attention{border-color:#925a20;color:#fde68a}.control.primary{border-color:#3a6da1;color:#bfdbfe}.control.safe{border-color:#9c7c31;color:#fde68a}.composer{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;margin-top:14px}.composer textarea{min-height:58px;resize:vertical;border:1px solid #304851;border-radius:12px;background:#0d151b;color:#eef5f4;padding:11px;font:inherit;font-size:.84rem}.notice{min-height:20px;margin-top:10px;color:#9db7b4;font-size:.78rem}.notice.error{color:#fecaca}.history{margin-top:14px}.history-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.history-heading .panel-heading{margin:0}.history-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.history-column{min-width:0}.history-list{display:grid;gap:7px}.history-empty{margin:0;color:#81969a;font-size:.78rem}.history-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px;border-radius:10px;background:#0c141a}.history-project{font-size:.82rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-detail{margin-top:3px;color:#81969a;font-size:.68rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-actions{display:flex;gap:5px}.history-actions .control{min-height:30px;padding:4px 7px;font-size:.68rem}@keyframes pulse{50%{box-shadow:0 0 0 4px #ff5b5933,0 8px 20px #0003}}@media(max-width:760px){.workspace{grid-template-columns:1fr}.composer{grid-template-columns:1fr}.composer .control{min-height:40px}.history-columns{grid-template-columns:1fr}}@media(max-width:470px){body{padding:16px 10px}.session-grid{grid-template-columns:repeat(2,1fr)}header{align-items:flex-start;flex-direction:column}.meta{text-align:left}}.mic-state{border:1px solid #304851;border-radius:999px;background:#17262d;color:#fde68a;padding:8px 14px;font:inherit;font-size:.72rem;cursor:pointer;letter-spacing:.05em}.mic-state.listening{border-color:#237b53;color:#a7f3c6}.mic-state.speaking{border-color:#3a6da1;color:#bfdbfe}.mic-state.muted{border-color:#8d4148;color:#fecaca}.mic-state.monitoring{border-color:#925a20;color:#fde68a}.mic-state[hidden]{display:none}.control.converse-on{border-color:#72d9d2;color:#7ee9dc}
</style></head><body><main class="shell"><header><div><span class="eyebrow">VIRTUAL MISSION CONTROL</span><h1>VIZHI</h1></div><button class="mic-state" id="mic-state" type="button" hidden></button><div class="meta" id="meta">Connecting…</div></header><section class="session-grid" id="session-grid" aria-label="Session grid"></section><section class="workspace"><aside class="panel" id="selected-session" aria-live="polite"></aside><section class="panel controls"><div class="control-group"><span class="control-label">Respond</span><div class="button-grid"><button class="control positive" data-action="approve" data-needs-session data-needs-waiting>✓ Yes</button><button class="control negative" data-action="deny" data-needs-session data-needs-waiting>× No</button><button class="control attention" data-action="interrupt" data-needs-session>Esc</button></div></div><div class="control-group"><span class="control-label">Codex</span><div class="button-grid"><button class="control" data-action="compact" data-needs-session>Compact</button><button class="control" data-action="new_session" data-needs-session>New</button><button class="control" data-action="fork" data-needs-session>Fork</button><button class="control" data-action="model" data-needs-session>Model</button><button class="control" data-action="mode" data-needs-session>Mode</button><button class="control" data-action="agent" data-needs-session>Agent</button><button class="control primary" data-action="focus" data-keep-terminal data-needs-session>Open Terminal</button></div></div><div class="control-group"><span class="control-label">Navigate</span><div class="button-grid"><button class="control" data-action="key" data-key="tab" data-needs-session>Tab</button><button class="control" data-action="key" data-key="up" data-needs-session>↑ Up</button><button class="control" data-action="key" data-key="down" data-needs-session>↓ Down</button><button class="control" data-action="key" data-key="enter" data-needs-session>↵ Enter</button><button class="control" data-action="key" data-key="page_up" data-needs-session>Pg Up</button><button class="control" data-action="key" data-key="page_down" data-needs-session>Pg Down</button></div></div><div class="control-group"><span class="control-label">Context</span><div class="button-grid"><button class="control" data-action="clipboard" data-needs-session>Clipboard</button><button class="control" data-action="screenshot" data-needs-session>Screenshot</button></div></div><div class="control-group"><span class="control-label">Quick</span><div class="button-grid" id="favorite-control"></div></div><div class="control-group"><span class="control-label">Prompts</span><div class="button-grid" id="prompt-controls"></div></div><div class="control-group"><span class="control-label">Git</span><div class="button-grid" id="git-controls"></div></div></section></section><section class="composer"><textarea id="composer-text" placeholder="Type a prompt for the selected session"></textarea><button class="control primary" id="send-text" data-needs-session>Send</button><button class="control" id="voice" data-needs-session>Browser Voice</button><button class="control" id="converse" data-needs-session>Converse</button></section><section class="panel history"><div class="history-heading"><p class="panel-heading">Session library</p><button class="control" id="refresh-history">Refresh</button></div><div class="history-columns"><div class="history-column"><span class="control-label">Recent</span><div class="history-list" id="recent-history"></div></div><div class="history-column"><span class="control-label">Archived</span><div class="history-list" id="archived-history"></div></div></div></section><div class="notice" id="notice" role="status"></div></main>
<script>
const vizhiToken='__VIZHI_TOKEN__';
if(window.history.replaceState)window.history.replaceState(null,'',window.location.pathname);
const sessionGrid=document.querySelector('#session-grid');
const selectedSession=document.querySelector('#selected-session');
const meta=document.querySelector('#meta');
const notice=document.querySelector('#notice');
const composerText=document.querySelector('#composer-text');
const promptControls=document.querySelector('#prompt-controls');
const gitControls=document.querySelector('#git-controls');
const favoriteControl=document.querySelector('#favorite-control');
const quickActions=favoriteControl;
const quickActionGroup=quickActions.closest('.control-group');
const respondGroup=document.querySelector('.controls .control-group');
quickActionGroup.querySelector('.control-label').remove();
quickActionGroup.insertAdjacentHTML('afterbegin','<div class="quick-actions-heading"><span class="control-label">Quick Actions</span><button class="control quick-actions-customize" id="customize-quick-actions" type="button" aria-haspopup="dialog">Customize</button></div>');
respondGroup.insertAdjacentElement('afterend',quickActionGroup);
quickActionGroup.insertAdjacentHTML('afterend','<div class="control-group"><span class="control-label">Terminal</span><div class="button-grid"><button class="control primary" data-action="new_terminal" data-keep-terminal>New Tab</button><button class="control primary" data-action="new_terminal" data-new-window data-keep-terminal>New Window</button><button class="control" data-action="exit" data-needs-session>Exit</button></div></div>');
quickActions.id='quick-actions';
quickActions.setAttribute('aria-live','polite');
document.body.insertAdjacentHTML('beforeend','<dialog class="quick-actions-dialog" id="quick-actions-dialog" aria-labelledby="quick-actions-title" aria-describedby="quick-actions-description"><form><div class="quick-actions-dialog-header"><div><h2 id="quick-actions-title">Customize Quick Actions</h2><p class="quick-actions-dialog-copy" id="quick-actions-description">Pin up to four frequently used commands. Drag to reorder, or use the arrow buttons.</p></div><button class="control" type="button" data-quick-close>Close</button></div><section><h3>Pinned</h3><div class="quick-actions-list" id="quick-actions-pinned"></div></section><section><h3>Available</h3><div class="quick-actions-list" id="quick-actions-available"></div></section><div class="quick-actions-dialog-footer"><button class="control" id="quick-actions-reset" type="button">Reset to defaults</button><button class="control primary" type="button" data-quick-close>Done</button></div></form></dialog>');
const quickActionsCustomize=document.querySelector('#customize-quick-actions');
const quickActionsDialog=document.querySelector('#quick-actions-dialog');
const quickActionsPinned=document.querySelector('#quick-actions-pinned');
const quickActionsAvailable=document.querySelector('#quick-actions-available');
const QUICK_ACTION_STORAGE_KEY='vizhi.quick-actions.v1';
const QUICK_ACTION_LIMIT=4;
const DEFAULT_QUICK_ACTION_IDS=['favorite','compact','prompt:write_tests','screenshot'];
const QUICK_ACTION_STATIC=[{id:'favorite',action:'favorite',label:'Favorite',primary:true},{id:'compact',action:'compact',label:'Compact'},{id:'screenshot',action:'screenshot',label:'Screenshot'},{id:'clipboard',action:'clipboard',label:'Clipboard'},{id:'model',action:'model',label:'Model'},{id:'mode',action:'mode',label:'Mode'},{id:'agent',action:'agent',label:'Agent'}];
const QUICK_GIT_TEMPLATE_IDS=['status','diff','log'];
let quickActionTemplates=[];
let favoriteTemplate=null;
let quickActionIds=readQuickActionIds();
let draggedQuickActionId=null;
const recentHistory=document.querySelector('#recent-history');
const archivedHistory=document.querySelector('#archived-history');
let latestState=null;
let selectedSlot=null;
let historyState={recent:[],archived:[]};
let browserVoiceDisclosureAccepted=false;
const VOICE_INTENTS=${JSON.stringify(VOICE_INTENTS)};
const SESSION_NUMBER_WORDS=${JSON.stringify(SESSION_NUMBER_WORDS)};
const CONVERSATION_POLICY=${JSON.stringify(CONVERSATION_POLICY)};
const summarizeForSpeech=${summarizeForSpeech.toString()};
const converseButton=document.querySelector('#converse');
const micState=document.querySelector('#mic-state');
let conversing=false;
let converseMuted=false;
let converseSpeaking=false;
let converseListening=false;
let recognitionSession=null;
let emptyTurns=0;
let listenAfterSpeech=false;
let lastConversationActivity=0;
let announcedQuestions={};
let previousConverseSlots=null;
let pendingAnnouncements=[];

function escapeMarkup(value){const element=document.createElement('span');element.textContent=value??'';return element.innerHTML}
function selectedSessionData(){return latestState&&latestState.slots.find(function(slot){return slot.slot===selectedSlot&&slot.session})}
function stateLabel(session,risk){return risk==='high'?'Risk':session.state==='waiting'?'Waiting':session.state==='busy'?'Working':'Ready'}
function contextLabel(session){return session.ctx_pct==null?'CTX --':'CTX '+session.ctx_pct+'%'}
function costLabel(session){return session.cost_usd==null?'--':'$'+Number(session.cost_usd).toFixed(2)}
function setNotice(message,isError){notice.textContent=message;notice.className=isError?'notice error':'notice'}
function confirmBrowserVoiceDisclosure(){if(browserVoiceDisclosureAccepted)return true;const accepted=window.confirm("Browser Voice uses your browser's speech-recognition service. Depending on browser settings, audio may be processed outside this Mac. Use physical Voice on the MX Creative Keypad for local Whisper transcription. Continue?");if(accepted)browserVoiceDisclosureAccepted=true;return accepted}
function readQuickActionIds(){try{const stored=window.localStorage.getItem(QUICK_ACTION_STORAGE_KEY);if(!stored)return null;const parsed=JSON.parse(stored);return Array.isArray(parsed)?parsed.filter(function(value){return typeof value==='string'}).slice(0,QUICK_ACTION_LIMIT):null}catch(error){return null}}
function saveQuickActionIds(){try{window.localStorage.setItem(QUICK_ACTION_STORAGE_KEY,JSON.stringify(quickActionIds))}catch(error){}}
function isQuickTemplate(template){return template.group==='Vizhi Prompts'||QUICK_GIT_TEMPLATE_IDS.includes(template.id)}
function quickActionDefinitions(){const favoriteLabel=favoriteTemplate?'★ '+favoriteTemplate.label:'★ Favorite';const staticDefinitions=QUICK_ACTION_STATIC.map(function(definition){return definition.id==='favorite'?Object.assign({},definition,{label:favoriteLabel}):definition});const templateDefinitions=quickActionTemplates.filter(isQuickTemplate).map(function(template){return{id:'prompt:'+template.id,action:'prompt_template',templateId:template.id,label:template.label}});return staticDefinitions.concat(templateDefinitions)}
function quickActionIndex(){const index={};quickActionDefinitions().forEach(function(definition){index[definition.id]=definition});return index}
function normalizeQuickActionIds(ids){const index=quickActionIndex();const normalized=[];(Array.isArray(ids)?ids:[]).forEach(function(id){if(typeof id!=='string'||!index[id]||normalized.includes(id)||normalized.length>=QUICK_ACTION_LIMIT)return;normalized.push(id)});return normalized}
function currentQuickActionIds(){return normalizeQuickActionIds(quickActionIds===null?DEFAULT_QUICK_ACTION_IDS:quickActionIds)}
function setQuickActionIds(ids){quickActionIds=normalizeQuickActionIds(ids);saveQuickActionIds();renderQuickActions();renderQuickActionEditor()}
function quickActionButton(definition){const templateId=definition.templateId?' data-template-id="'+escapeMarkup(definition.templateId)+'"':'';return '<button class="control'+(definition.primary?' primary':'')+'" data-action="'+escapeMarkup(definition.action)+'"'+templateId+' data-needs-session>'+escapeMarkup(definition.label)+'</button>'}
function renderQuickActions(){const index=quickActionIndex();const ids=currentQuickActionIds();quickActions.innerHTML=ids.length?ids.map(function(id){return quickActionButton(index[id])}).join(''):'<p class="quick-actions-empty">No quick actions pinned. Choose Customize to add up to four.</p>';updateAvailability()}
function quickActionEditorRow(definition,index,total){const actionId=escapeMarkup(definition.id);const label=escapeMarkup(definition.label);return '<div class="quick-actions-editor-row" draggable="true" data-quick-action-id="'+actionId+'"><span class="quick-actions-drag" aria-hidden="true">⋮⋮</span><span class="quick-actions-name">'+label+'</span><div class="quick-actions-row-controls"><button class="control" type="button" data-quick-action-control="move_left" data-quick-action-id="'+actionId+'" aria-label="Move '+label+' left"'+(index===0?' disabled':'')+'>←</button><button class="control" type="button" data-quick-action-control="move_right" data-quick-action-id="'+actionId+'" aria-label="Move '+label+' right"'+(index===total-1?' disabled':'')+'>→</button><button class="control negative" type="button" data-quick-action-control="remove" data-quick-action-id="'+actionId+'">Remove</button></div></div>'}
function availableQuickActionRow(definition,atLimit){const actionId=escapeMarkup(definition.id);const label=escapeMarkup(definition.label);return '<div class="quick-actions-editor-row"><span class="quick-actions-drag" aria-hidden="true">+</span><span class="quick-actions-name">'+label+'</span><div class="quick-actions-row-controls"><button class="control primary" type="button" data-quick-action-control="pin" data-quick-action-id="'+actionId+'"'+(atLimit?' disabled':'')+'>Pin</button></div></div>'}
function renderQuickActionEditor(){const index=quickActionIndex();const ids=currentQuickActionIds();const pinned=ids.map(function(id){return index[id]});const pinnedIds=new Set(ids);const available=quickActionDefinitions().filter(function(definition){return!pinnedIds.has(definition.id)});quickActionsPinned.innerHTML=pinned.length?pinned.map(function(definition,position){return quickActionEditorRow(definition,position,pinned.length)}).join(''):'<p class="quick-actions-empty">Nothing pinned yet. Add up to four actions below.</p>';quickActionsAvailable.innerHTML=available.length?available.map(function(definition){return availableQuickActionRow(definition,pinned.length>=QUICK_ACTION_LIMIT)}).join(''):'<p class="quick-actions-empty">All available actions are pinned.</p>'}
function openQuickActionsDialog(){renderQuickActionEditor();if(typeof quickActionsDialog.showModal==='function'){if(!quickActionsDialog.open)quickActionsDialog.showModal()}else quickActionsDialog.setAttribute('open','')}
function closeQuickActionsDialog(){if(typeof quickActionsDialog.close==='function')quickActionsDialog.close();else quickActionsDialog.removeAttribute('open')}
function pinQuickAction(id){const ids=currentQuickActionIds();if(ids.includes(id)||ids.length>=QUICK_ACTION_LIMIT)return;setQuickActionIds(ids.concat(id))}
function removeQuickAction(id){setQuickActionIds(currentQuickActionIds().filter(function(item){return item!==id}))}
function moveQuickAction(id,direction){const ids=currentQuickActionIds();const position=ids.indexOf(id);const nextPosition=position+direction;if(position<0||nextPosition<0||nextPosition>=ids.length)return;const moved=ids.splice(position,1)[0];ids.splice(nextPosition,0,moved);setQuickActionIds(ids)}
function moveQuickActionBefore(id,targetId){if(id===targetId)return;const ids=currentQuickActionIds();const position=ids.indexOf(id);if(position<0||ids.indexOf(targetId)<0)return;ids.splice(position,1);ids.splice(ids.indexOf(targetId),0,id);setQuickActionIds(ids)}
function chooseSelectedSlot(){if(selectedSessionData())return;const focused=latestState&&latestState.slots.find(function(slot){return slot.session&&slot.session.session_id===latestState.focused_session});const first=latestState&&latestState.slots.find(function(slot){return slot.session});selectedSlot=(focused||first||{}).slot||null}
function renderSessions(){chooseSelectedSlot();sessionGrid.innerHTML=latestState.slots.map(function(slot){const session=slot.session;if(!session)return '<button class="session empty" disabled><div class="session-title"><span>Available</span><span class="slot">SLOT '+slot.slot+'</span></div></button>';const selected=slot.slot===selectedSlot?' selected':'';return '<button class="session'+selected+'" data-slot="'+slot.slot+'" data-state="'+escapeMarkup(session.state)+'" data-risk="'+escapeMarkup(slot.risk)+'"><div class="session-title"><span>'+escapeMarkup(session.project)+'</span><span class="slot">CTX</span></div><div class="session-state">'+escapeMarkup(stateLabel(session,slot.risk))+'</div><div class="session-ctx">'+escapeMarkup(contextLabel(session))+'</div></button>'}).join('')}
function renderSelectedSession(){const slot=selectedSessionData();if(!slot){selectedSession.innerHTML='<p class="panel-heading">Selected session · Live usage</p><div class="selected-project">No active session</div><p class="activity">Open Codex in Terminal.app, then select its card here.</p>';return}const session=slot.session;const activity=session.question||session.pending_command||session.pending_tool||'Ready for your next instruction';selectedSession.innerHTML='<p class="panel-heading">Selected session · Live usage · Slot '+slot.slot+'</p><div class="selected-project">'+escapeMarkup(session.project)+'</div><div class="selected-status">'+escapeMarkup(stateLabel(session,slot.risk))+'</div><div class="usage"><div class="metric"><span>Context</span><strong>'+escapeMarkup(contextLabel(session))+'</strong></div><div class="metric"><span>Cost</span><strong>'+escapeMarkup(costLabel(session))+'</strong></div><div class="metric"><span>Model</span><strong>'+escapeMarkup(session.model||'Codex')+'</strong></div><div class="metric"><span>Reasoning</span><strong>'+escapeMarkup(session.reasoning||'--')+'</strong></div></div><p class="activity">'+escapeMarkup(activity)+'</p>'}
function updateAvailability(){const selected=selectedSessionData();document.querySelectorAll('[data-needs-session]').forEach(function(control){control.disabled=!selected||(control.dataset.needsWaiting!==undefined&&selected.session.state!=='waiting')})}
function renderState(){if(!latestState)return;meta.textContent=latestState.overflow?latestState.overflow+' unslotted session(s)':'Local IPC · live';renderSessions();renderSelectedSession();updateAvailability();detectConverseTransitions()}
function renderTemplates(templates){quickActionTemplates=templates;const groups={prompts:[],git:[]};templates.forEach(function(template){const target=template.group==='Vizhi Git'?groups.git:groups.prompts;target.push('<button class="control" data-action="prompt_template" data-template-id="'+escapeMarkup(template.id)+'" data-needs-session>'+escapeMarkup(template.label)+'</button>')});promptControls.innerHTML=groups.prompts.join('');gitControls.innerHTML=groups.git.join('');renderQuickActions();renderQuickActionEditor();updateAvailability()}
function renderFavorite(template){favoriteTemplate=template;renderQuickActions();renderQuickActionEditor();updateAvailability()}
function historyRows(entries,archived){if(!entries.length)return '<p class="history-empty">'+(archived?'No archived sessions.':'No completed sessions yet.')+'</p>';return entries.map(function(entry){const detail=(entry.cwd||'No project path')+' · '+new Date(entry.updated_at).toLocaleString();const action=archived?'unarchive':'resume';const actionLabel=archived?'Restore':'Resume';const secondary=archived?'':'<button class="control attention" data-history-action="archive" data-session-id="'+escapeMarkup(entry.session_id)+'">Archive</button>';return '<article class="history-item"><div><div class="history-project">'+escapeMarkup(entry.project)+'</div><div class="history-detail">'+escapeMarkup(detail)+'</div></div><div class="history-actions"><button class="control primary" data-history-action="'+action+'" data-session-id="'+escapeMarkup(entry.session_id)+'">'+actionLabel+'</button>'+secondary+'</div></article>'}).join('')}
function renderHistory(){recentHistory.innerHTML=historyRows(historyState.recent,false);archivedHistory.innerHTML=historyRows(historyState.archived,true)}
async function requestJson(url,options){const requestOptions=Object.assign({},options,{headers:Object.assign({'x-vizhi-token':vizhiToken},options&&options.headers||{})});const response=await fetch(url,requestOptions);const result=await response.json();if(!response.ok)throw new Error(result.error||'Request failed');return result}
async function loadHistory(){historyState=await requestJson('/api/history');renderHistory()}
async function queueAction(payload,returnToBrowser){const selected=selectedSessionData();if(!selected&&payload.type!=='new_terminal'){setNotice('Select an active session first.',true);return}payload.slot=selected?selectedSlot:1;if(returnToBrowser)payload.return_to_browser=true;await requestJson('/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});setNotice(payload.type==='screenshot'?'Screenshot staged in Slot '+selectedSlot+'. Tap Voice to describe it and send both automatically, or type context and press Enter.':payload.type==='new_terminal'?'Opening a new Terminal '+(payload.open_in_new_window?'window':'tab')+'.':'Sent '+(payload.type==='prompt_template'?'prompt':payload.type.replaceAll('_',' '))+' to Slot '+selectedSlot+'.')}
async function handleControl(control){const action=control.dataset.action;if(action==='clipboard'&&!window.confirm('Paste your current clipboard into the selected Codex session?'))return;if(action==='screenshot'&&!window.confirm('Choose a screen area, then Vizhi will stage its local image path in the selected Codex prompt. Continue?'))return;if(action==='exit'&&!window.confirm('Exit the selected Codex session? Its saved conversation remains available to resume.'))return;const payload={type:action};if(action==='key')payload.key=control.dataset.key;if(action==='prompt_template')payload.template_id=control.dataset.templateId;if(action==='new_terminal'&&control.dataset.newWindow!==undefined)payload.open_in_new_window=true;await queueAction(payload,control.dataset.keepTerminal===undefined)}
async function handleHistoryAction(control){const action=control.dataset.historyAction;const sessionId=control.dataset.sessionId;if(action==='archive'&&!window.confirm('Archive this saved session? It can be restored later.'))return;const result=await requestJson('/api/history/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session_id:sessionId})});if(action==='resume')setNotice('Opening the saved session in a new Terminal tab.');else setNotice(action==='archive'?'Session archived.':'Session restored.');if(result.recent){historyState=result;renderHistory()}else await loadHistory()}
quickActionsCustomize.addEventListener('click',openQuickActionsDialog);
document.querySelector('#quick-actions-reset').addEventListener('click',function(){setQuickActionIds(DEFAULT_QUICK_ACTION_IDS);setNotice('Quick Actions reset to the Vizhi defaults.')});
document.addEventListener('click',function(event){const quickControl=event.target.closest('[data-quick-action-control]');if(quickControl){const id=quickControl.dataset.quickActionId;const action=quickControl.dataset.quickActionControl;if(action==='pin')pinQuickAction(id);if(action==='remove')removeQuickAction(id);if(action==='move_left')moveQuickAction(id,-1);if(action==='move_right')moveQuickAction(id,1);return}const closeControl=event.target.closest('[data-quick-close]');if(closeControl)closeQuickActionsDialog()});
document.addEventListener('dragstart',function(event){const row=event.target.closest('#quick-actions-pinned [data-quick-action-id]');if(!row)return;draggedQuickActionId=row.dataset.quickActionId;if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggedQuickActionId)}});
document.addEventListener('dragover',function(event){const row=event.target.closest('#quick-actions-pinned [data-quick-action-id]');if(!draggedQuickActionId||!row||row.dataset.quickActionId===draggedQuickActionId)return;event.preventDefault();document.querySelectorAll('.quick-actions-editor-row.drag-over').forEach(function(element){element.classList.remove('drag-over')});row.classList.add('drag-over');if(event.dataTransfer)event.dataTransfer.dropEffect='move'});
document.addEventListener('drop',function(event){const row=event.target.closest('#quick-actions-pinned [data-quick-action-id]');if(!draggedQuickActionId||!row)return;event.preventDefault();moveQuickActionBefore(draggedQuickActionId,row.dataset.quickActionId);draggedQuickActionId=null;document.querySelectorAll('.quick-actions-editor-row.drag-over').forEach(function(element){element.classList.remove('drag-over')})});
document.addEventListener('dragend',function(){draggedQuickActionId=null;document.querySelectorAll('.quick-actions-editor-row.drag-over').forEach(function(element){element.classList.remove('drag-over')})});
document.addEventListener('click',function(event){const sessionButton=event.target.closest('[data-slot]');if(sessionButton){selectedSlot=Number(sessionButton.dataset.slot);renderState();setNotice('Slot '+selectedSlot+' selected. Use Open Terminal only when you want to leave this dashboard.');return}const historyControl=event.target.closest('[data-history-action]');if(historyControl){handleHistoryAction(historyControl).catch(function(error){setNotice(error.message,true)});return}const control=event.target.closest('[data-action]');if(control){handleControl(control).catch(function(error){setNotice(error.message,true)})}});
document.querySelector('#send-text').addEventListener('click',function(){const text=composerText.value.trim();if(!text){setNotice('Type a prompt before sending it.',true);return}queueAction({type:'voice',text:text},true).then(function(){composerText.value=''}).catch(function(error){setNotice(error.message,true)})});
document.querySelector('#voice').addEventListener('click',function(){if(!confirmBrowserVoiceDisclosure()){setNotice('Browser Voice was not started. Use physical Voice for local Whisper transcription.',true);return}const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){setNotice('Browser Voice is unavailable here. Type text and press Send.',true);return}const voiceButton=this;const recognition=new Recognition();recognition.lang=navigator.language||'en-US';recognition.interimResults=false;recognition.maxAlternatives=1;voiceButton.disabled=true;voiceButton.textContent='Listening…';setNotice('Listening…');recognition.onresult=function(event){const text=(event.results[0][0].transcript||'').trim();if(!text){setNotice('No speech was captured. Try Browser Voice again or type text.',true);return}composerText.value=text;queueAction({type:'voice',text:text},true).then(function(){composerText.value=''}).catch(function(error){setNotice('Voice captured. '+error.message+' You can press Send to retry.',true)})};recognition.onerror=function(){setNotice('Browser Voice failed. Type text and press Send.',true)};recognition.onend=function(){voiceButton.textContent='Browser Voice';updateAvailability()};recognition.start()});
document.querySelector('#refresh-history').addEventListener('click',function(){loadHistory().then(function(){setNotice('Session library refreshed.')}).catch(function(error){setNotice(error.message,true)})});
function normalizeUtterance(text){return (text||'').toLowerCase().replace(/[\\u2019']/g,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\\s+/g,' ').trim()}
function parseVoiceIntent(text){const utterance=normalizeUtterance(text);if(!utterance)return{intent:'prompt',text:''};const matched=Object.keys(VOICE_INTENTS).find(function(id){return id!=='focus_session'&&VOICE_INTENTS[id].some(function(phrase){return normalizeUtterance(phrase)===utterance})});if(matched)return{intent:matched};let focusSlot=null;VOICE_INTENTS.focus_session.forEach(function(prefix){if(focusSlot)return;const normalizedPrefix=normalizeUtterance(prefix);if(!utterance.startsWith(normalizedPrefix+' '))return;const value=utterance.slice(normalizedPrefix.length+1);focusSlot=SESSION_NUMBER_WORDS[value]||(/^[1-6]$/.test(value)?Number(value):null)});if(focusSlot)return{intent:'focus_session',slot:focusSlot};return{intent:'prompt',text:(text||'').trim()}}
function pendingDescription(session){const pending=((session.pending_tool||'')+' '+(session.pending_command||'')).trim();return pending||'a pending command'}
function occupiedSessionCount(){return latestState?latestState.slots.filter(function(slot){return slot.session}).length:0}
function questionKey(session){return session.state+'|'+(session.waiting_kind||'')+'|'+(session.question||'')}
function questionAnnouncement(slot){const session=slot.session;const question=session.question||'Approval requested';let text=(session.project||'Codex')+' is asking: '+question+(question.endsWith('.')?'':'.');if(slot.risk==='high')text+=' High risk: '+pendingDescription(session)+'. Say '+CONVERSATION_POLICY.confirmPhrase+' to allow, or no to deny.';else text+=' Say yes to approve, or no to deny.';return text}
function buildDigest(){const parts=[];let waitingCount=0;(latestState?latestState.slots:[]).forEach(function(slot){const session=slot.session;if(!session)return;let status='ready';if(session.state==='waiting'){status='waiting for approval';waitingCount++}else if(session.state==='busy')status='working';parts.push((session.project||'Codex')+' is '+status)});if(!parts.length)return 'No sessions are running.';let summary=parts.length===1?'One session':parts.length+' sessions';if(waitingCount)summary+=waitingCount===1?', one needs you':', '+waitingCount+' need you';return summary+'. '+parts.join('. ')+'.'}
function updateMicState(){if(!conversing){micState.hidden=true;return}micState.hidden=false;const mode=converseMuted?'muted':converseSpeaking?'speaking':converseListening?'listening':'monitoring';micState.className='mic-state '+mode;micState.textContent=converseMuted?'Muted — click to talk':converseSpeaking?'Speaking… (click to interrupt)':converseListening?'Listening… (click to stop)':'Monitoring (click to talk)'}
function queueConverseAnnouncement(text,thenListen){lastConversationActivity=Date.now();pendingAnnouncements.push({text:text,thenListen:thenListen})}
function drainConverseAnnouncements(){if(!conversing||converseSpeaking||converseListening)return;const next=pendingAnnouncements.shift();if(next)converseSpeak(next.text,next.thenListen)}
function stopListening(){converseListening=false;if(recognitionSession){const recognition=recognitionSession;recognitionSession=null;recognition.onresult=null;recognition.onend=null;recognition.onerror=null;try{recognition.stop()}catch(error){}}updateMicState()}
function startListening(){if(!conversing||converseMuted||converseSpeaking||converseListening)return;const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition)return;const recognition=new Recognition();recognitionSession=recognition;converseListening=true;recognition.lang=navigator.language||'en-US';recognition.interimResults=false;recognition.maxAlternatives=1;let gotResult=false;recognition.onresult=function(event){gotResult=true;const text=(event.results[0][0].transcript||'').trim();handleConverseUtterance(text)};recognition.onerror=function(){};recognition.onend=function(){converseListening=false;recognitionSession=null;updateMicState();if(!conversing||converseMuted||gotResult)return;emptyTurns++;if(emptyTurns<CONVERSATION_POLICY.maxEmptyTurns)startListening();else{emptyTurns=0;drainConverseAnnouncements()}};recognition.start();updateMicState()}
function converseSpeak(text,thenListen){listenAfterSpeech=thenListen&&!converseMuted;lastConversationActivity=Date.now();stopListening();if(!window.speechSynthesis){setNotice(text);if(conversing&&listenAfterSpeech){listenAfterSpeech=false;startListening()}else drainConverseAnnouncements();return}converseSpeaking=true;updateMicState();window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.onend=utterance.onerror=function(){if(!converseSpeaking)return;converseSpeaking=false;updateMicState();if(!conversing||converseMuted)return;if(listenAfterSpeech){listenAfterSpeech=false;startListening()}else drainConverseAnnouncements()};window.speechSynthesis.speak(utterance)}
async function handleConverseIntent(intent){const selected=selectedSessionData();if(intent.intent==='approve'||intent.intent==='confirm_approve'){if(!selected||selected.session.state!=='waiting'){converseSpeak('That request is no longer pending.',false);return}if(intent.intent==='approve'&&selected.risk==='high'){converseSpeak('High risk: '+pendingDescription(selected.session)+'. Say '+CONVERSATION_POLICY.confirmPhrase+' to allow, or no to deny.',true);return}await queueAction({type:'approve'},true);converseSpeak('Approved.',false);return}if(intent.intent==='deny'){if(!selected||selected.session.state!=='waiting'){converseSpeak('That request is no longer pending.',false);return}await queueAction({type:'deny'},true);converseSpeak('Denied.',false);return}if(intent.intent==='status'){converseSpeak(buildDigest(),false);return}if(intent.intent==='read_more'){const summary=selected?summarizeForSpeech(selected.session.last_message||'',700):'';converseSpeak(summary||'There is nothing to read right now.',false);return}if(intent.intent==='focus_session'){const target=latestState&&latestState.slots.find(function(slot){return slot.slot===intent.slot&&slot.session});if(!target){converseSpeak('Session '+intent.slot+' is empty.',false);return}selectedSlot=intent.slot;renderState();await queueAction({type:'focus'},true);if(target.session.state==='waiting'){announcedQuestions[target.session.session_id]=questionKey(target.session);converseSpeak('Switched to '+(target.session.project||'Codex')+'. '+questionAnnouncement(target),true)}else converseSpeak('Switched to '+(target.session.project||'Codex')+'.',false);return}if(intent.intent==='screenshot'){await queueAction({type:'screenshot'},true);converseSpeak('Screenshot started. Select an area, then speak your context.',false);return}if(intent.intent==='mute'){setConverseMuted(true);return}if(intent.intent==='end_conversation'){stopConversation('Goodbye.');return}await queueAction({type:'voice',text:intent.text},true);if(occupiedSessionCount()>1)converseSpeak('Sent to '+((selected&&selected.session.project)||'the session')+'.',false);else{updateMicState();drainConverseAnnouncements()}}
function handleConverseUtterance(text){lastConversationActivity=Date.now();const intent=parseVoiceIntent(text);if(intent.intent==='prompt'&&!intent.text){emptyTurns++;if(emptyTurns<CONVERSATION_POLICY.maxEmptyTurns)converseSpeak("I didn't catch that.",true);else{emptyTurns=0;drainConverseAnnouncements()}return}emptyTurns=0;handleConverseIntent(intent).catch(function(error){converseSpeak('That failed. '+error.message,false)})}
function detectConverseTransitions(){if(!conversing||!latestState)return;const current=latestState.slots;const previous=previousConverseSlots;previousConverseSlots=current;if(!previous)return;const currentById={};current.forEach(function(slot){if(slot.session)currentById[slot.session.session_id]=slot});previous.forEach(function(slot){if(!slot.session)return;const id=slot.session.session_id;const now=currentById[id];if(now&&now.session.state!=='dead'){if(slot.session.state==='busy'&&now.session.state==='idle'){const summary=summarizeForSpeech(now.session.last_message||'',240);const multi=Object.keys(currentById).length>1;const name=now.session.project||'Codex';queueConverseAnnouncement(summary?(multi?name+': '+summary:summary):(multi?name+' finished.':'Finished.'),false)}return}delete announcedQuestions[id];queueConverseAnnouncement((slot.session.project||'Codex')+' session ended.',false)});current.forEach(function(slot){if(!slot.session||slot.session.state!=='waiting')return;const key=questionKey(slot.session);if(announcedQuestions[slot.session.session_id]===key)return;announcedQuestions[slot.session.session_id]=key;queueConverseAnnouncement(questionAnnouncement(slot),true)});const anyNow=current.some(function(slot){return slot.session});const anyBefore=previous.some(function(slot){return slot.session});if(!anyNow&&anyBefore){stopConversation('All sessions ended. Ending voice conversation.');return}drainConverseAnnouncements()}
function setConverseMuted(muted){converseMuted=muted;if(!muted){updateMicState();return}stopListening();if(window.speechSynthesis&&converseSpeaking){converseSpeaking=false;window.speechSynthesis.cancel()}updateMicState()}
function startConversation(){if(conversing)return;if(!confirmBrowserVoiceDisclosure()){setNotice('Conversation was not started. Use the keypad Voice key for local Whisper transcription.',true);return}const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){setNotice('Conversation mode needs browser speech recognition. Use the keypad Voice key instead.',true);return}conversing=true;converseMuted=false;converseSpeaking=false;emptyTurns=0;pendingAnnouncements=[];announcedQuestions={};previousConverseSlots=latestState?latestState.slots:null;lastConversationActivity=Date.now();converseButton.textContent='End Conversation';converseButton.classList.add('converse-on');(latestState?latestState.slots:[]).forEach(function(slot){if(slot.session&&slot.session.state==='waiting'){announcedQuestions[slot.session.session_id]=questionKey(slot.session);pendingAnnouncements.push({text:questionAnnouncement(slot),thenListen:true})}});converseSpeak('Voice conversation on. '+buildDigest(),true)}
function stopConversation(farewell){if(!conversing)return;conversing=false;converseMuted=false;pendingAnnouncements=[];announcedQuestions={};previousConverseSlots=null;stopListening();converseSpeaking=false;if(window.speechSynthesis)window.speechSynthesis.cancel();converseButton.textContent='Converse';converseButton.classList.remove('converse-on');updateMicState();if(farewell&&window.speechSynthesis)window.speechSynthesis.speak(new SpeechSynthesisUtterance(farewell))}
converseButton.addEventListener('click',function(){if(conversing)stopConversation('Ending voice conversation.');else startConversation()});
micState.addEventListener('click',function(){if(!conversing)return;if(converseMuted){converseMuted=false;startListening();return}if(converseSpeaking){converseSpeaking=false;listenAfterSpeech=false;window.speechSynthesis.cancel();startListening();return}if(converseListening){stopListening();drainConverseAnnouncements();return}startListening()});
setInterval(function(){if(conversing&&Date.now()-lastConversationActivity>CONVERSATION_POLICY.idleTimeoutMinutes*60000)stopConversation('Ending voice conversation after inactivity.')},30000);
async function initialize(){try{const responses=await Promise.all([requestJson('/api/state'),requestJson('/api/templates'),requestJson('/api/favorite'),requestJson('/api/history')]);latestState=responses[0];renderTemplates(responses[1]);renderFavorite(responses[2]);historyState=responses[3];renderHistory();renderState()}catch(error){setNotice(error.message||'Unable to connect to Vizhi.',true)}}
new EventSource('/events?token='+encodeURIComponent(vizhiToken)).onmessage=function(event){latestState=JSON.parse(event.data);renderState()};setInterval(function(){requestJson('/api/state').then(function(state){latestState=state;renderState()}).catch(function(){})},4000);setInterval(function(){loadHistory().catch(function(){})},30000);initialize();
</script></body></html>`;

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (Buffer.concat(chunks).length > 10_000) throw new Error("request body too large");
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

const QUICK_ACTIONS_STYLE = `<style>
.quick-actions-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.quick-actions-heading .control-label{margin:0}.quick-actions-customize{min-height:30px;padding:4px 8px;font-size:.68rem}.quick-actions-empty{margin:0;padding:10px;border:1px dashed #304851;border-radius:10px;color:#81969a;font-size:.76rem;line-height:1.4}.quick-actions-dialog{width:min(680px,calc(100vw - 28px));max-height:calc(100vh - 28px);border:1px solid #36515b;border-radius:16px;background:#101a20;color:#eef5f4;padding:0;box-shadow:0 24px 80px #0009}.quick-actions-dialog::backdrop{background:#020609b8}.quick-actions-dialog form{display:grid;gap:16px;padding:18px}.quick-actions-dialog-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.quick-actions-dialog h2,.quick-actions-dialog h3,.quick-actions-dialog p{margin:0}.quick-actions-dialog h2{font-size:1rem}.quick-actions-dialog h3{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#8fa4a7}.quick-actions-dialog-copy{margin-top:5px!important;color:#9db7b4;font-size:.8rem;line-height:1.4}.quick-actions-list{display:grid;gap:7px}.quick-actions-editor-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px;border:1px solid #304851;border-radius:10px;background:#0c141a}.quick-actions-editor-row[draggable=true]{cursor:grab}.quick-actions-editor-row.drag-over{border-color:#72d9d2;background:#14272d}.quick-actions-drag{color:#8fa4a7;font-size:1rem;line-height:1;letter-spacing:-.2em}.quick-actions-name{min-width:0;font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.quick-actions-row-controls{display:flex;gap:5px}.quick-actions-row-controls .control{min-height:30px;padding:4px 7px;font-size:.68rem}.quick-actions-dialog-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:2px}.quick-actions-dialog-footer .control{min-height:36px}@media(max-width:470px){.quick-actions-editor-row{grid-template-columns:auto minmax(0,1fr)}.quick-actions-row-controls{grid-column:2;justify-content:flex-end}.quick-actions-dialog-footer{align-items:stretch;flex-direction:column}.quick-actions-dialog-footer .control{width:100%}}
</style>`;

function renderedPage(token: string): string {
  return PAGE.replace("__VIZHI_TOKEN__", token).replace("</head>", `${QUICK_ACTIONS_STYLE}</head>`);
}

function receivedToken(request: IncomingMessage, url: URL): string | null {
  if (url.pathname === "/events") return url.searchParams.get("token");
  const token = request.headers["x-vizhi-token"];
  return typeof token === "string" ? token : null;
}

function tokenMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function cookieValue(request: IncomingMessage, name: string): string | null {
  const cookie = request.headers.cookie;
  if (!cookie) return null;
  for (const entry of cookie.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

function requestOriginMatchesHost(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers.host;
  return typeof host === "string" && origin === `http://${host}`;
}

function isAuthorizedRequest(request: IncomingMessage, url: URL, token: string): boolean {
  return tokenMatches(receivedToken(request, url), token) && requestOriginMatchesHost(request);
}

type BrowserAction = Pick<Action, "type" | "slot" | "text" | "key" | "template_id" | "open_in_new_window" | "return_to_browser">;

function browserAction(value: unknown): BrowserAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const action = value as Partial<Action>;
  if (typeof action.slot !== "number" || !Number.isInteger(action.slot) || action.slot < 1 || action.slot > GRID_SLOT_COUNT) return null;
  if (action.return_to_browser !== undefined && typeof action.return_to_browser !== "boolean") return null;
  if (action.open_in_new_window !== undefined && typeof action.open_in_new_window !== "boolean") return null;
  const browserReturn = action.return_to_browser ? { return_to_browser: true } : {};
  const browserWindow = action.open_in_new_window ? { open_in_new_window: true } : {};
  switch (action.type) {
    case "focus":
    case "approve":
    case "deny":
    case "interrupt":
    case "compact":
    case "new_session":
    case "exit":
    case "model":
    case "mode":
    case "agent":
    case "fork":
    case "favorite":
    case "clipboard":
    case "screenshot":
      return { type: action.type, slot: action.slot, ...browserReturn };
    case "new_terminal":
      return { type: action.type, slot: action.slot, ...browserWindow, ...browserReturn };
    case "key":
      return typeof action.key === "string" && (TERMINAL_KEYS as readonly string[]).includes(action.key)
        ? { type: action.type, slot: action.slot, key: action.key, ...browserReturn }
        : null;
    case "prompt_template":
      return isPromptTemplateId(action.template_id)
        ? { type: action.type, slot: action.slot, template_id: action.template_id, ...browserReturn }
        : null;
    case "voice": {
      const text = typeof action.text === "string" ? action.text.trim() : "";
      return text ? { type: action.type, slot: action.slot, text, ...browserReturn } : null;
    }
    default:
      return null;
  }
}

function requestedSessionId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sessionId = (value as { session_id?: unknown }).session_id;
  return isSessionId(sessionId) ? sessionId : null;
}

async function templates(): Promise<Array<{ id: string; label: string; group: string }>> {
  return Promise.all(PROMPT_TEMPLATE_IDS.map(async (id) => {
    const template = await getPromptTemplate(id);
    return { id, label: template.label, group: DEFAULT_PROMPT_TEMPLATES[id].group };
  }));
}

async function historySnapshot(store: StateStore, history: CodexSessionHistory): Promise<{ recent: SessionHistoryEntry[]; archived: SessionHistoryEntry[] }> {
  const [grid, recent, archived] = await Promise.all([store.getGrid(), history.list(false), history.list(true)]);
  const activeSessionIds = new Set(grid.slots.flatMap((slot) => slot.session ? [slot.session.session_id] : []));
  return { recent: recent.filter((entry) => !activeSessionIds.has(entry.session_id)), archived };
}

function activeSessionIds(grid: GridSnapshot): Set<string> {
  return new Set(grid.slots.flatMap((slot) => slot.session ? [slot.session.session_id] : []));
}

export async function startServer(store: StateStore, port = 4917): Promise<{ close: () => Promise<void>; port: number; token: string }> {
  const clients = new Set<ServerResponse>();
  const history = new CodexSessionHistory();
  const token = randomBytes(32).toString("base64url");
  let previousSnapshot = "";
  const notify = async () => {
    const snapshot = JSON.stringify(await store.getGrid());
    if (snapshot === previousSnapshot) return;
    previousSnapshot = snapshot;
    for (const client of clients) client.write(`data: ${snapshot}\n\n`);
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/") {
      const dashboardToken = url.searchParams.get("token") ?? cookieValue(request, "vizhi_session");
      if (!tokenMatches(dashboardToken, token)) {
        return json(response, 403, { error: "unauthorized" });
      }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
        "set-cookie": `vizhi_session=${token}; HttpOnly; SameSite=Strict; Path=/`,
      });
      response.end(renderedPage(token));
      return;
    }
    if ((url.pathname === "/actions" || url.pathname === "/events" || url.pathname.startsWith("/api/"))
      && !isAuthorizedRequest(request, url, token)) {
      return json(response, 403, { error: "unauthorized" });
    }
    if (request.method === "GET" && url.pathname === "/api/state") return json(response, 200, await store.getGrid());
    if (request.method === "GET" && url.pathname === "/api/templates") return json(response, 200, await templates());
    if (request.method === "GET" && url.pathname === "/api/favorite") return json(response, 200, await getFavoriteTemplate());
    if (request.method === "GET" && url.pathname === "/api/history") return json(response, 200, await historySnapshot(store, history));
    if (request.method === "GET" && url.pathname === "/events") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      clients.add(response);
      request.on("close", () => clients.delete(response));
      response.write(`data: ${JSON.stringify(await store.getGrid())}\n\n`);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/history/resume") {
      try {
        const sessionId = requestedSessionId(await body(request));
        const entry = sessionId ? await history.find(sessionId, false) : null;
        if (!entry) return json(response, 404, { error: "Saved Codex session not found." });
        return json(response, 201, await store.createResumeAction(entry.session_id, entry.cwd, true));
      } catch (error) {
        return json(response, 400, { error: error instanceof Error ? error.message : "invalid request" });
      }
    }
    if (request.method === "POST" && (url.pathname === "/api/history/archive" || url.pathname === "/api/history/unarchive")) {
      try {
        const sessionId = requestedSessionId(await body(request));
        if (!sessionId) return json(response, 400, { error: "invalid session id" });
        const archived = url.pathname.endsWith("/unarchive");
        const entry = await history.find(sessionId, archived);
        if (!entry) return json(response, 404, { error: "Saved Codex session not found." });
        if (!archived && activeSessionIds(await store.getGrid()).has(sessionId)) {
          return json(response, 409, { error: "Stop the live session before archiving it." });
        }
        if (archived) await history.unarchive(sessionId);
        else await history.archive(sessionId);
        return json(response, 200, await historySnapshot(store, history));
      } catch (error) {
        return json(response, 400, { error: error instanceof Error ? error.message : "Unable to update session archive." });
      }
    }
    if (request.method === "POST" && url.pathname === "/actions") {
      try {
        const action = browserAction(await body(request));
        if (!action) return json(response, 400, { error: "invalid action payload" });
        const { type, slot, ...details } = action;
        if (type === "new_terminal") {
          return json(response, 201, await store.createNewTerminalAction(slot, details.open_in_new_window === true, details.return_to_browser === true));
        }
        return json(response, 201, await store.createAction(type, slot, details));
      } catch (error) {
        return json(response, 400, { error: error instanceof Error ? error.message : "invalid request" });
      }
    }
    json(response, 404, { error: "not found" });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    try {
      server.listen(port, "127.0.0.1");
    } catch (error) {
      onError(error as Error);
    }
  });
  const interval = setInterval(() => void notify(), 250);
  const address = server.address() as AddressInfo;
  return {
    port: address.port,
    token,
    close: async () => {
      clearInterval(interval);
      for (const client of clients) client.end();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
