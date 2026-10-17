# Agent 13 - fitur MIKROSTRUKTUR menit-1 (blok <= init+600). Hanya data on-chain nyata.
import csv, json, os, sys, math
from collections import defaultdict
import statistics as st
ROOT = r"C:\Users\horii\rhc-quant\rhc_vps"
DATA = os.path.join(ROOT, "data"); OUT = os.path.dirname(os.path.abspath(__file__))
NATIVE = "0x" + "0"*40; PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951"
Q96 = 2.0**96; WIN = 600; BLKSEC = 0.1013
NAN = float("nan")
def sd(a,b): return a/b if b else NAN
def med(x): return st.median(x) if x else NAN
def pct(x,q):
    if not x: return NAN
    y=sorted(x); i=min(len(y)-1,int(q*(len(y)-1)+0.5)); return y[i]
def gini(x):
    x=sorted(v for v in x if v>0)
    n=len(x)
    if n<2: return NAN
    s=sum(x)
    return sd(sum((2*(i+1)-n-1)*v for i,v in enumerate(x)), n*s)
def slope(y):
    n=len(y)
    if n<4: return NAN
    mx=(n-1)/2.0; my=sum(y)/n
    sxx=sum((i-mx)**2 for i in range(n)); sxy=sum((i-mx)*(y[i]-my) for i in range(n))
    return sd(sxy,sxx)

def fitur(sw, lq, tr, m, dev):
    q1 = m["c1"] == NATIVE
    eth = m["eth"]; f = {}
    sw = sorted(sw, key=lambda x: (x[0], x[1]))
    n = len(sw)
    rel=[x[0] for x in sw]; li=[x[1] for x in sw]; tx=[x[2] for x in sw]
    a0=[float(x[3]) for x in sw]; a1=[float(x[4]) for x in sw]
    spq=[float(x[5])/Q96 for x in sw]; L=[float(x[6]) for x in sw]; tk=[int(x[7]) for x in sw]
    base = a0 if q1 else a1; quote = a1 if q1 else a0
    buy=[b>0 for b in base]
    usd=[abs(q)/1e18*eth for q in quote]
    pr=[]
    for s in spq:
        p = s*s
        pr.append(1.0/p if q1 else p)
    bu=[usd[i] for i in range(n) if buy[i]]
    se=[usd[i] for i in range(n) if not buy[i]]
    # ---------- A. ukuran swap ----------
    f["mz_med_buy"]=med(bu); f["mz_p90_buy"]=pct(bu,0.9)
    f["mz_disp"]=sd(pct(bu,0.9),med(bu)); f["mz_gini"]=gini(bu)
    f["mz_max_frac"]=sd(max(bu),sum(bu)) if bu else NAN
    mb=med(bu)
    f["mz_big_frac"]=sd(sum(1 for v in bu if mb==mb and v>=3*mb),len(bu)) if bu else NAN
    f["mz_tot_buy"]=sum(bu); f["mz_n_buy"]=len(bu)
    # ---------- B. jejak harga per swap ----------
    ib=[]; isl=[]; seq=[]
    for i in range(1,n):
        if pr[i-1]<=0 or pr[i]<=0 or usd[i]<=0: continue
        d=abs(math.log(pr[i]/pr[i-1]))/usd[i]
        seq.append(math.log1p(d))
        (ib if buy[i] else isl).append(d)
    f["mi_buy"]=med(ib); f["mi_sell"]=med(isl)
    f["mi_asym"]=math.log(sd(med(ib),med(isl))) if (ib and isl and med(isl)>0 and med(ib)>0) else NAN
    f["mi_decay"]=slope(seq)
    f["mi_first3"]=sd(med(ib[:3]),med(ib[3:])) if len(ib)>6 and med(ib[3:])>0 else NAN
    f["mi_pump_cost"]=sd(math.log(pr[-1]/pr[0]), sum(bu)) if (bu and pr[0]>0 and pr[-1]>0) else NAN
    # ---------- C. pola waktu ----------
    gaps=[rel[i]-rel[i-1] for i in range(1,n)]
    f["mt_gap_med"]=med(gaps); f["mt_gap_p90"]=pct(gaps,0.9)
    f["mt_gap_cv"]=sd(st.pstdev(gaps),st.mean(gaps)) if len(gaps)>2 and st.mean(gaps)>0 else NAN
    bl=defaultdict(int)
    for r in rel: bl[r]+=1
    f["mt_blk_uniq"]=sd(len(bl),n)
    f["mt_same_blk"]=sd(sum(v for v in bl.values() if v>1),n)
    tc=defaultdict(int)
    for t in tx: tc[t]+=1
    f["mt_same_tx"]=sd(sum(v for v in tc.values() if v>1),n)
    f["mt_empty_max"]=max(gaps)-1 if gaps else NAN
    f["mt_span"]=(rel[-1]-rel[0])/float(WIN)
    f["mt_first_gap"]=rel[0]
    f["mt_first_sec"]=rel[0]*BLKSEC
    f["mt_rate"]=sd(n,max(rel[-1]-rel[0],1))
    # ---------- D. kedalaman vs ukuran beli ----------
    lp0=abs(quote[0])/1e18*eth if n else NAN
    f["md_maxbuy_L"]=sd(max(bu),L[0]) if bu and L[0] else NAN
    f["md_totbuy_L"]=sd(sum(bu),L[0]) if bu and L[0] else NAN
    tokin=sum(float(t[4]) for t in tr if t[3]==PM and t[2]!=PM)
    tokout=sum(float(t[4]) for t in tr if t[2]==PM)
    f["md_pool_bought"]=sd(tokout,tokin)
    f["md_lp0_usd"]=lp0
    # ---------- E. tick ----------
    f["me_tick_move"]=tk[-1]-tk[0]
    f["me_tick_per_usd"]=sd(abs(tk[-1]-tk[0]),sum(bu)) if bu else NAN
    pos=defaultdict(float)
    for r in lq: pos[(r[2],r[3])]+=r[4]
    posp={k:v for k,v in pos.items() if v>0}
    f["me_n_pos"]=len(posp)
    if posp:
        big=max(posp,key=lambda k:posp[k])
        w=big[1]-big[0]
        f["me_width"]=w
        f["me_full"]=1.0 if w>=1700000 else 0.0
        f["me_conc"]=sd(posp[big],sum(posp.values()))
        f["me_pos_in_rng"]=sd(tk[0]-big[0],w)
        f["me_hdr"]=sd(tk[-1]-big[0],w)
    else:
        for k in ["me_width","me_full","me_conc","me_pos_in_rng","me_hdr"]: f[k]=NAN
    f["me_lq_n"]=len(lq)
    # ---------- F. pembeli ----------
    outmap=defaultdict(list); inmap=defaultdict(list)
    for t in tr:
        if t[2]==PM: outmap[t[0]].append((t[1],t[3],float(t[4])))
        if t[3]==PM and t[2]!=PM: inmap[t[0]].append((t[1],t[2],float(t[4])))
    who=[None]*n
    for i in range(n):
        want=abs(base[i]); b=rel[i]
        cand = outmap.get(b,[]) if buy[i] else inmap.get(b,[])
        best=None;bd=None
        for lj,addr,amt in cand:
            d=abs(amt-want)
            if bd is None or d<bd: bd=d; best=addr
        if best is not None and bd is not None and bd<=max(1.0,want*1e-6): who[i]=best
    byr=defaultdict(float); order=[]
    for i in range(n):
        if buy[i] and who[i]:
            byr[who[i]]+=usd[i]
            if who[i] not in order: order.append(who[i])
    f["mf_match"]=sd(sum(1 for i in range(n) if who[i]),n)
    if byr:
        tot=sum(byr.values())
        f["mf_dom_buyer"]=sd(max(byr.values()),tot)
        f["mf_hhi"]=sum((v/tot)**2 for v in byr.values()) if tot else NAN
        cnt=defaultdict(int)
        for i in range(n):
            if buy[i] and who[i]: cnt[who[i]]+=1
        f["mf_repeat_frac"]=sd(sum(1 for v in cnt.values() if v>1),len(cnt))
        f["mf_first_repeat"]=1.0 if cnt.get(order[0],0)>1 else 0.0
        f["mf_first3_repeat"]=sd(sum(1 for a in order[:3] if cnt.get(a,0)>1),min(3,len(order)))
        f["mf_dev_buy"]=sd(byr.get(dev,0.0),tot) if dev else NAN
    else:
        for k in ["mf_dom_buyer","mf_hhi","mf_repeat_frac","mf_first_repeat","mf_first3_repeat","mf_dev_buy"]: f[k]=NAN
    # ---------- G. jual cepat ----------
    T=WIN//3
    be=sum(usd[i] for i in range(n) if buy[i] and rel[i]<=T)
    se1=sum(usd[i] for i in range(n) if not buy[i] and rel[i]<=T)
    f["mg_sell_early"]=sd(se1,be)
    fs=[rel[i] for i in range(n) if not buy[i]]
    f["mg_first_sell"]=(min(fs) if fs else WIN)/float(WIN)
    f["mg_sell_n"]=sd(len(se),n)
    bset=set(); flip=0; tots=0
    for i in range(n):
        if buy[i] and who[i]: bset.add(who[i])
        elif (not buy[i]) and who[i]:
            tots+=1
            if who[i] in bset: flip+=1
    f["mg_flip_frac"]=sd(flip,tots)
    f["mg_sell_usd_frac"]=sd(sum(se),sum(bu)+sum(se)) if (bu or se) else NAN
    return f

def proses(ds):
    meta=json.load(open(os.path.join(OUT,"meta_%s.json"%ds)))
    lq=json.load(open(os.path.join(OUT,"liq_%s.json"%ds)))
    tf=json.load(open(os.path.join(DATA,ds,"transfers.json")))
    cr={}
    p=os.path.join(DATA,ds,"dev_creator.json")
    if os.path.exists(p): cr=json.load(open(p))
    sw=defaultdict(list)
    with open(os.path.join(OUT,"m1raw_%s.csv"%ds)) as fh:
        rd=csv.reader(fh); next(rd)
        for r in rd: sw[r[0]].append([int(r[1]),int(r[2]),int(r[3]),r[4],r[5],r[6],r[7],r[8]])
    rows=[]
    for pid,s in sw.items():
        m=meta.get(pid)
        if not m or not m.get("eth"): continue
        tr=[[x[0]-m["init"],x[1],x[2].lower(),x[3].lower(),x[4]] for x in tf.get(pid,{}).get("tr",[]) if 0<=x[0]-m["init"]<=WIN]
        dev=(cr.get(pid) or {}).get("dev")
        if dev: dev=dev.lower()
        try: f=fitur(s,lq.get(pid,[]),tr,m,dev)
        except Exception as e:
            print("ERR",pid,repr(e),file=sys.stderr); continue
        f["ds"]=ds; f["pool"]=pid; rows.append(f)
    return rows

if __name__=="__main__":
    allr=[]
    for ds in sys.argv[1:]:
        r=proses(ds); print(ds,len(r),file=sys.stderr); allr+=r
    keys=[k for k in allr[0] if k not in ("ds","pool")]
    with open(os.path.join(OUT,"mikro.csv"),"w",newline="") as fh:
        w=csv.writer(fh); w.writerow(["ds","pool"]+keys)
        for r in allr:
            w.writerow([r["ds"],r["pool"]]+[("" if (isinstance(r[k],float) and r[k]!=r[k]) else r[k]) for k in keys])
    print("tulis mikro.csv",len(allr),file=sys.stderr)
