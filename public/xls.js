/* Đọc file báo cáo bán hàng .xls (Excel 97-2003) của máy bán hàng BLK46, ngay trong trình duyệt.
   Tự viết, không dùng thư viện ngoài. Chỉ tải khi quản lý mở tab tích điểm, trang khách không tải file này.
   File không gửi đi đâu: đọc xong chỉ giữ số phiếu, giờ đóng, khu và tiền tính điểm của từng phiếu.
   Hai phần:
   1. readXls(ArrayBuffer) -> {sheets:[{name, rows}]}: mở hộp chứa (OLE), lấy luồng Workbook, đọc ô của từng sheet.
   2. posBills(rows) -> các phiếu của đêm: gộp các dòng món cùng "Số phiếu", tiền tính điểm = thành tiền − giảm giá. */
(function(g){
"use strict";
const MAX_BYTES=8*1024*1024;
function fail(code,msg){const e=new Error(msg);e.code=code;return e}

/* ---------- 1. hộp chứa OLE (Compound File) ---------- */
function cfbStreams(u8){
  const MAGIC=[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
  if(u8.length<512||MAGIC.some((b,i)=>u8[i]!==b))throw fail("notxls","không phải file .xls (Excel 97-2003)");
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  const ss=1<<dv.getUint16(30,true),mss=1<<dv.getUint16(32,true);
  if(ss!==512&&ss!==4096)throw fail("bad","file .xls hỏng (cỡ khối lạ)");
  const nSec=Math.floor((u8.length-ss)/ss)+1;
  const secOff=i=>(i+1)*ss;
  const ENDS=0xFFFFFFFA;
  // danh sách khối FAT: 109 ô đầu nằm ở header, còn lại theo chuỗi DIFAT
  const fatSecs=[];
  for(let i=0;i<109;i++){const v=dv.getUint32(76+i*4,true);if(v<ENDS)fatSecs.push(v)}
  let dif=dv.getUint32(68,true),guard=0;
  while(dif<ENDS&&guard++<nSec){
    const o=secOff(dif);if(o+ss>u8.length)break;
    for(let i=0;i<ss/4-1;i++){const v=dv.getUint32(o+i*4,true);if(v<ENDS)fatSecs.push(v)}
    dif=dv.getUint32(o+ss-4,true);
  }
  const fat=new Uint32Array(fatSecs.length*ss/4);
  fatSecs.forEach((s,k)=>{const o=secOff(s);for(let i=0;i<ss/4;i++)fat[k*ss/4+i]=o+i*4+4<=u8.length?dv.getUint32(o+i*4,true):0xFFFFFFFE});
  function chain(start,table){
    const out=[];let s=start;
    while(s<ENDS&&s<table.length){out.push(s);if(out.length>table.length)throw fail("bad","file .xls hỏng (chuỗi khối lặp)");s=table[s]}
    return out;
  }
  function readChain(start,size){
    const secs=chain(start,fat),buf=new Uint8Array(secs.length*ss);
    secs.forEach((s,i)=>{const o=secOff(s);buf.set(u8.subarray(o,Math.min(o+ss,u8.length)),i*ss)});
    return size==null?buf:buf.subarray(0,Math.min(size,buf.length));
  }
  // thư mục: mỗi mục 128 byte
  const dir=readChain(dv.getUint32(48,true));
  const ddv=new DataView(dir.buffer,dir.byteOffset,dir.byteLength);
  const ents=[];
  for(let o=0;o+128<=dir.length;o+=128){
    const nl=ddv.getUint16(o+64,true),type=dir[o+66];
    let name="";for(let i=0;i+1<Math.min(nl,64)-1;i+=2)name+=String.fromCharCode(ddv.getUint16(o+i,true));
    ents.push({name,type,start:ddv.getUint32(o+116,true),size:ddv.getUint32(o+120,true)});
  }
  const root=ents.find(e=>e.type===5);
  const cutoff=dv.getUint32(56,true);
  let mini=null,minifat=null;
  function getMini(){
    if(mini)return;
    mini=readChain(root.start,root.size);
    const mf=readChain(dv.getUint32(60,true));
    const mdv=new DataView(mf.buffer,mf.byteOffset,mf.byteLength);
    minifat=new Uint32Array(mf.length/4);for(let i=0;i<minifat.length;i++)minifat[i]=mdv.getUint32(i*4,true);
  }
  function stream(name){
    const e=ents.find(x=>x.type===2&&x.name===name);if(!e)return null;
    if(e.size<cutoff&&root){
      getMini();const secs=chain(e.start,minifat),buf=new Uint8Array(secs.length*mss);
      secs.forEach((s,i)=>buf.set(mini.subarray(s*mss,s*mss+mss),i*mss));
      return buf.subarray(0,e.size);
    }
    return readChain(e.start,e.size);
  }
  return {stream};
}

/* ---------- 2. bản ghi BIFF8 ---------- */
function records(wb,from){
  const out=[];let p=from||0;
  while(p+4<=wb.length){
    const t=wb[p]|(wb[p+1]<<8),l=wb[p+2]|(wb[p+3]<<8);
    out.push({t,d:wb.subarray(p+4,Math.min(p+4+l,wb.length)),at:p});
    p+=4+l;
    if(t===0x0A&&from)break; // hết sheet
  }
  return out;
}
const u16=(d,o)=>d[o]|(d[o+1]<<8);
const u32=(d,o)=>(d[o]|(d[o+1]<<8)|(d[o+2]<<16))+d[o+3]*16777216;
function f64(d,o){return new DataView(d.buffer,d.byteOffset+o,8).getFloat64(0,true)}
function rk(v){
  let n;
  if(v&2)n=(v|0)>>2;
  else{const b=new DataView(new ArrayBuffer(8));b.setUint32(4,(v&0xFFFFFFFC)>>>0,true);n=b.getFloat64(0,true)}
  return v&1?n/100:n;
}
// chuỗi Unicode của Excel (XLUnicodeString): độ dài 2 byte (hoặc 1), cờ, chữ
function xlStr(d,o,lenBytes){
  const cch=lenBytes===1?d[o]:u16(d,o);o+=lenBytes;
  const fl=d[o++];let runs=0,ext=0;
  if(fl&8){runs=u16(d,o);o+=2}
  if(fl&4){ext=u32(d,o);o+=4}
  let s="";
  if(fl&1){for(let i=0;i<cch;i++)s+=String.fromCharCode(u16(d,o+i*2));o+=cch*2}
  else{for(let i=0;i<cch;i++)s+=String.fromCharCode(d[o+i]);o+=cch}
  return {s,end:o+runs*4+ext};
}
// bảng chuỗi dùng chung (SST), có thể bị cắt qua nhiều bản ghi CONTINUE
function readSST(frags){
  const out=[];if(!frags.length)return out;
  let fi=0,d=frags[0],p=8;const total=u32(d,4);
  const more=()=>{while(p>=d.length&&fi<frags.length-1){fi++;d=frags[fi];p=0}return p<d.length};
  const b=()=>{more();return d[p++]};
  const w=()=>b()|(b()<<8);
  const skip=n=>{while(n>0){if(!more())return;const k=Math.min(n,d.length-p);p+=k;n-=k}};
  for(let i=0;i<total;i++){
    if(!more())break;
    const cch=w(),fl=b();let runs=0,ext=0;
    if(fl&8)runs=w();
    if(fl&4)ext=(w()|(w()<<16))>>>0;
    let wide=fl&1,left=cch,s="";
    while(left>0){
      if(p>=d.length){if(fi>=frags.length-1)break;fi++;d=frags[fi];p=0;wide=d[p++]&1} // chữ bị cắt: bản ghi sau mở đầu bằng cờ
      const avail=wide?(d.length-p)>>1:d.length-p,n=Math.min(left,avail);
      if(wide){for(let k=0;k<n;k++,p+=2)s+=String.fromCharCode(d[p]|(d[p+1]<<8))}
      else{for(let k=0;k<n;k++)s+=String.fromCharCode(d[p++])}
      left-=n;
      if(!n&&p<d.length)break;
    }
    skip(runs*4+ext);
    out.push(s);
  }
  return out;
}
function readXls(buf){
  const u8=buf instanceof Uint8Array?buf:new Uint8Array(buf);
  if(u8.length>MAX_BYTES)throw fail("big","file quá lớn (trên 8 MB), không giống file một đêm");
  const head=String.fromCharCode(...u8.subarray(0,5));
  if(head.startsWith("PK"))throw fail("xlsx","file đang là .xlsx. mở bằng Excel, chọn Lưu thành → Excel 97-2003 (.xls), rồi tải lại");
  if(/^\s*</.test(head))throw fail("html","file này là trang web đổi đuôi .xls, không phải file Excel thật");
  const cfb=cfbStreams(u8);
  const wb=cfb.stream("Workbook")||cfb.stream("Book");
  if(!wb)throw fail("notxls","không thấy bảng tính trong file");
  const glob=records(wb);
  if(!glob.length||glob[0].t!==0x809||u16(glob[0].d,0)!==0x600)throw fail("old","file Excel đời cũ (trước 97), lưu lại thành .xls 97-2003 rồi tải lại");
  const sheets=[],sstFrags=[];let date1904=false,inSST=false;
  for(const r of glob){
    if(r.t===0x0A)break;
    if(r.t===0x85){const name=xlStr(r.d,6,1).s;if(r.d[5]===0)sheets.push({name,off:u32(r.d,0)})}
    else if(r.t===0x22)date1904=u16(r.d,0)===1;
    if(r.t===0xFC){inSST=true;sstFrags.push(r.d)}
    else if(r.t===0x3C&&inSST)sstFrags.push(r.d);
    else inSST=false;
  }
  const sst=readSST(sstFrags);
  return {date1904,sheets:sheets.map(sh=>({name:sh.name,rows:sheetRows(wb,sh.off,sst)}))};
}
function sheetRows(wb,off,sst){
  const rows=[];
  const put=(r,c,v)=>{(rows[r]||(rows[r]=[]))[c]=v};
  let pendingFormula=null;
  for(const {t,d} of records(wb,off)){
    switch(t){
      case 0xFD:put(u16(d,0),u16(d,2),sst[u32(d,6)]??"");break;              // ô chữ (bảng chuỗi)
      case 0x203:put(u16(d,0),u16(d,2),f64(d,6));break;                      // ô số
      case 0x27E:put(u16(d,0),u16(d,2),rk(u32(d,6)));break;                  // ô số gọn
      case 0xBD:{const r=u16(d,0),c0=u16(d,2),n=(d.length-6)/6;                // nhiều ô số gọn
        for(let i=0;i<n;i++)put(r,c0+i,rk(u32(d,4+i*6+2)));break}
      case 0x204:put(u16(d,0),u16(d,2),xlStr(d,6,2).s);break;                // ô chữ trực tiếp
      case 0x205:put(u16(d,0),u16(d,2),d[7]?"":!!d[6]);break;                 // đúng/sai
      case 0x06:{const r=u16(d,0),c=u16(d,2);                                 // công thức: lấy kết quả đã lưu
        if(d[12]===0xFF&&d[13]===0xFF){if(d[6]===0)pendingFormula=[r,c];else if(d[6]===1)put(r,c,!!d[8])}
        else put(r,c,f64(d,6));break}
      case 0x207:if(pendingFormula){put(pendingFormula[0],pendingFormula[1],xlStr(d,0,2).s);pendingFormula=null}break;
    }
  }
  for(let i=0;i<rows.length;i++)if(!rows[i])rows[i]=[];
  return rows;
}

/* ---------- 3. đọc báo cáo bán hàng thành từng phiếu ---------- */
const norm=s=>String(s??"").normalize("NFC").toLowerCase().replace(/\s+/g," ").trim();
const COLS={phieu:["số phiếu"],close:["thời gian đóng"],area:["khu"],table:["bàn","số bàn","tên bàn","mã bàn"],amount:["thành tiền"],discount:["giảm giá"]};
function num(v){
  if(typeof v==="number")return v;
  let s=String(v??"").replace(/\s/g,"");if(!s)return 0;
  if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,"");
  else if(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))s=s.replace(/\./g,"").replace(",",".");
  const n=Number(s);return isFinite(n)?n:NaN;
}
const pad=n=>String(n).padStart(2,"0");
// giờ đóng phiếu: chữ "MM/DD/YYYY HH:MM:SS" (máy bán hàng ghi kiểu Mỹ) hoặc số ngày của Excel
function parseClose(v,order,date1904){
  if(typeof v==="number"&&v>20000){
    const ms=Math.round((v-(date1904?24107:25569))*864e5),d=new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
  const m=String(v??"").trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if(!m)return "";
  const [a,b]=order==="dmy"?[m[2],m[1]]:[m[1],m[2]];
  return `${m[3]}-${pad(a)}-${pad(b)}T${pad(m[4])}:${m[5]}:${m[6]||"00"}`;
}
function addDay(iso,n){const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function posBills(input,opt){
  opt=opt||{};
  const rows=input.rows||input,date1904=!!input.date1904;
  const noPoints=(opt.noPointsAreas||["bod"]).map(norm);
  // dòng tiêu đề: dòng có ô "Số phiếu"
  const hr=rows.findIndex(r=>r&&r.some(c=>norm(c)==="số phiếu"));
  if(hr<0)throw fail("cols","file không có cột \"Số phiếu\". cần file báo cáo bán hàng từng món của cả đêm");
  const col={};
  rows[hr].forEach((c,i)=>{const n=norm(c);for(const k in COLS)if(col[k]==null&&COLS[k].includes(n))col[k]=i});
  const miss=["phieu","close","area","amount"].filter(k=>col[k]==null);
  if(miss.length)throw fail("cols","file thiếu cột: "+miss.map(k=>({phieu:"Số phiếu",close:"Thời gian đóng",area:"Khu",amount:"thành tiền"})[k]).join(", "));
  // ngày kinh doanh: dòng "Ngày: dd/mm/yyyy" ngay dưới tiêu đề (có file để phía trên)
  let bizDate="",shift="";
  for(let i=0;i<Math.min(rows.length,hr+6);i++)for(const c of rows[i]||[]){
    const s=String(c??"");let m=s.match(/ngày\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if(m&&!bizDate)bizDate=`${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    m=s.match(/ca\s*:\s*(\S+)/i);if(m&&!shift)shift=m[1];
  }
  const raw=[];let footer=null;
  for(let i=hr+1;i<rows.length;i++){
    const r=rows[i]||[],ph=String(r[col.phieu]??"").trim();
    if(!ph){const a=num(r[col.amount]);if(a)footer=a;continue}
    if(/^(ngày|ca)\s*:/i.test(ph)||(r[col.close]==null||r[col.close]==="")&&(r[col.amount]==null||r[col.amount]===""))continue; // dòng ghi ngày, ca
    raw.push({ph,close:r[col.close],area:String(r[col.area]??"").trim(),table:col.table==null?"":String(r[col.table]??"").trim(),amount:num(r[col.amount]),discount:col.discount==null?0:num(r[col.discount]),row:i+1});
  }
  if(!raw.length)throw fail("empty","file không có phiếu nào");
  // ngày tháng trong giờ đóng: thử hai cách đọc, chọn cách khớp ngày kinh doanh (hoặc rạng sáng hôm sau)
  let order="mdy";
  const texts=raw.map(x=>String(x.close??"").match(/^(\d{1,2})[\/.-](\d{1,2})/)).filter(Boolean);
  if(texts.some(m=>+m[1]>12))order="dmy";
  else if(!texts.some(m=>+m[2]>12)&&bizDate){
    const ok=o=>raw.filter(x=>{const c=parseClose(x.close,o,date1904).slice(0,10);return c===bizDate||c===addDay(bizDate,1)}).length;
    if(ok("dmy")>ok("mdy"))order="dmy";
  }
  // ngày kinh doanh dự phòng: phần giữa số phiếu dạng yymmdd (30-1-261105-00007)
  if(!bizDate){const m=raw[0].ph.match(/-(\d{2})(\d{2})(\d{2})-/);if(m)bizDate=`20${m[1]}-${m[2]}-${m[3]}`}
  const warn=[],map=new Map();
  for(const x of raw){
    if(isNaN(x.amount)||isNaN(x.discount)){warn.push(`dòng ${x.row}: số tiền không đọc được`);continue}
    let b=map.get(x.ph);
    if(!b){b={no:x.ph,seq:(x.ph.match(/(\d+)\s*$/)||[,""])[1],area:x.area,close:"",amount:0,discount:0,lines:0};if(col.table!=null)b.table="";map.set(x.ph,b)}
    if(x.table&&!b.table)b.table=x.table;
    if(b.area!==x.area&&!b.areaWarn){b.areaWarn=1;warn.push(`phiếu ${x.ph} có món ở hai khu (${b.area}, ${x.area})`)}
    const c=parseClose(x.close,order,date1904);if(c>b.close)b.close=c;
    b.amount+=x.amount;b.discount+=Math.abs(x.discount);b.lines++;
  }
  const bills=[],skipped=[];let sum=0;
  for(const b of map.values()){
    delete b.areaWarn;
    sum+=b.amount;
    b.base=Math.max(0,Math.round(b.amount-b.discount));
    b.amount=Math.round(b.amount);b.discount=Math.round(b.discount);
    if(!b.close)warn.push(`phiếu ${b.no}: không đọc được giờ đóng`);
    if(noPoints.includes(norm(b.area))){b.skip="no-area";skipped.push(b)}
    else bills.push(b);
  }
  bills.sort((a,b)=>a.close<b.close?-1:a.close>b.close?1:0);
  const check=footer==null?null:{file:Math.round(footer),read:Math.round(sum),ok:Math.round(footer)===Math.round(sum)};
  if(check&&!check.ok)warn.push(`tổng thành tiền cuối file ${check.file} khác tổng đọc được ${check.read}`);
  return {bizDate,shift,dateOrder:order,bills,skipped,check,warn};
}
function readPosFile(buf,opt){
  const x=readXls(buf);
  if(!x.sheets.length)throw fail("empty","file không có sheet nào");
  let lastErr;
  for(const sh of x.sheets){try{return {sheet:sh.name,...posBills({rows:sh.rows,date1904:x.date1904},opt)}}catch(e){lastErr=e}}
  throw lastErr;
}
g.BLKXLS={readXls,posBills,readPosFile,_num:num};
})(typeof window!=="undefined"?window:globalThis);
