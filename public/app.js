Pi.init({version:'2.0',sandbox:true});
let token='',me=null;
const $=s=>document.querySelector(s);
const api=async(m,u,b,isForm)=>{
 const r=await fetch(u,{method:m,headers:{Authorization:'Bearer '+token,...(b&&!isForm?{'Content-Type':'application/json'}:{})},
  body:b?(isForm?b:JSON.stringify(b)):undefined});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'خطأ');return j};
const el=(t,txt,cls)=>{const e=document.createElement(t);if(txt!==undefined&&txt!==null)e.textContent=txt;if(cls)e.className=cls;return e};
const btn=(txt,fn,cls)=>{const b=el('button',txt,cls);b.onclick=async()=>{try{await fn();load()}catch(e){alert(e.message)}};return b};
const shrink=f=>new Promise((ok,no)=>{const i=new Image(),u=URL.createObjectURL(f);
 i.onload=()=>{const s=Math.min(1,900/Math.max(i.width,i.height)),c=document.createElement('canvas');
  c.width=Math.round(i.width*s);c.height=Math.round(i.height*s);c.getContext('2d').drawImage(i,0,0,c.width,c.height);
  URL.revokeObjectURL(u);c.toBlob(b=>b?ok(b):no(new Error('فشل تجهيز الصورة')),'image/jpeg',0.75)};
 i.onerror=()=>no(new Error('صورة غير صالحة'));i.src=u});

async function login(){
 const a=await Pi.authenticate(['username','payments'],p=>{
  if(p.transaction)api('POST','/api/payments/complete',{paymentId:p.identifier,txid:p.transaction.txid}).catch(()=>{})});
 token=a.accessToken;me=a.user;$('#me').textContent='@'+me.username;load();
}
function buy(p){
 Pi.createPayment({amount:p.price,memo:'شراء '+p.title,metadata:{productId:p.id}},{
  onReadyForServerApproval:id=>api('POST','/api/payments/approve',{paymentId:id}),
  onReadyForServerCompletion:(id,tx)=>api('POST','/api/payments/complete',{paymentId:id,txid:tx}).then(load),
  onCancel:()=>{},onError:e=>alert('فشل الدفع')});
}
async function load(){
 const ps=await fetch('/api/products').then(r=>r.json()),L=$('#list');L.replaceChildren();
 ps.forEach(p=>{const c=el('div',null,'card'),i=el('img');i.src=p.image;i.alt=p.title;
  c.append(i,el('h3',p.title),el('div',p.desc),el('b',p.price+' Pi'),el('div','البائع: '+p.seller));
  if(me&&p.sellerUid===me.uid){
   c.append(btn('تغيير السعر',async()=>{const v=prompt('السعر الجديد',p.price);if(v)await api('PUT','/api/products/'+p.id,{price:Number(v)})}),
            btn('حذف',async()=>{if(confirm('حذف المنتج؟'))await api('DELETE','/api/products/'+p.id)},'red'));
  }else if(me)c.append(btn('شراء',()=>buy(p)));
  L.append(c)});
 if(!me)return;const os=await api('GET','/api/orders'),O=$('#orders');O.replaceChildren();
 os.forEach(o=>{const c=el('div',null,'card');c.append(el('b',o.title+' - '+o.price+' Pi'),el('div','الحالة: '+o.status));
  if(o.sellerUid===me.uid&&o.status==='paid')c.append(btn('تم الشحن',()=>api('POST',`/api/orders/${o.id}/ship`)));
  if(o.buyerUid===me.uid&&o.status==='shipped')c.append(btn('استلمت المنتج',()=>api('POST',`/api/orders/${o.id}/confirm`)));
  if(o.buyerUid===me.uid&&['paid','shipped'].includes(o.status))c.append(btn('فتح نزاع',()=>api('POST',`/api/orders/${o.id}/dispute`),'red'));
  O.append(c)});
}
$('#add').onsubmit=async e=>{e.preventDefault();try{
 const fd=new FormData(e.target);fd.set('image',await shrink(fd.get('image')),'photo.jpg');
 await api('POST','/api/products',fd,true);e.target.reset();load()}catch(x){alert(x.message)}};
login().catch(()=>{load();alert('افتح التطبيق من Pi Browser')});
