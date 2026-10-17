import json, numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
BG,PANEL,GRID,TXT,MUT="#0B0F14","#11171E","#1E2833","#D5DDE5","#7F8B97"
UP,DN,GOLD,BLUE,VIO="#3FB68B","#E5484D","#E3A33B","#4C9BE8","#9B7BF0"
plt.rcParams.update({"figure.facecolor":BG,"axes.facecolor":PANEL,"savefig.facecolor":BG,"axes.edgecolor":GRID,
  "axes.labelcolor":MUT,"xtick.color":MUT,"ytick.color":MUT,"text.color":TXT,"grid.color":GRID,"grid.linewidth":0.6,
  "axes.grid":True,"font.family":"DejaVu Sans","font.size":9.5,"axes.titlesize":11,"axes.titleweight":"bold",
  "axes.titlelocation":"left","axes.spines.top":False,"axes.spines.right":False,"legend.frameon":False,"text.parse_math":False})
usd=FuncFormatter(lambda v,_: f"${v:,.0f}" if v<1e4 else (f"${v/1e3:,.0f}k" if v<1e6 else f"${v/1e6:,.1f}M"))
def simpan(fig,n): fig.savefig(f"viz/{n}.png",dpi=115,bbox_inches="tight"); plt.close(fig)

# ---------- 1) KURVA EQUITY NYATA + DRAWDOWN ----------
eq=json.load(open("eq_final178.json"))["eqCurve"]; T=json.load(open("trade_final178_lengkap.json"))
e=np.array([100]+[x[1] for x in eq]); n=np.arange(len(e))
peak=np.maximum.accumulate(e); dd=(e/peak-1)*100
fig,(a,b)=plt.subplots(2,1,figsize=(12,6.2),gridspec_kw={"height_ratios":[3,1.1],"hspace":0.08},sharex=True)
a.plot(n,e,color=GOLD,lw=1.8); a.fill_between(n,100,e,color=GOLD,alpha=0.08)
a.set_yscale("log"); a.yaxis.set_major_formatter(usd)
bat={}; 
for i,t in enumerate(T): bat.setdefault(t["ds"],i+1)
lab={"u_ds5d":"±5 Sep","u_ds24":"±10 Sep","m1":"13–15 Sep","m2":"16–17 Sep"}
for ds,i in bat.items():
    a.axvline(i,color=MUT,lw=0.7,ls=":"); a.text(i+1,a.get_ylim()[0]*1.15 if False else e.max()*0.55,lab.get(ds,ds),color=MUT,fontsize=8.5,rotation=90,va="top")
a.scatter([n[-1]],[e[-1]],color=GOLD,s=38,zorder=5); a.annotate(f"${e[-1]:,.0f}",(n[-1],e[-1]),xytext=(-8,8),textcoords="offset points",ha="right",color=GOLD,fontweight="bold")
a.set_title("Equity uji maju — 178 trade nyata, modal $100 (skala log)")
b.fill_between(n,dd,0,color=DN,alpha=0.35,step="post"); b.plot(n,dd,color=DN,lw=1,drawstyle="steps-post")
b.set_ylabel("Drawdown %"); b.set_xlabel("Nomor trade"); b.set_ylim(min(dd.min()*1.15,-1),1)
b.annotate(f"maks {dd.min():.1f}%",(n[np.argmin(dd)],dd.min()),xytext=(6,-2),textcoords="offset points",color=DN,fontsize=8.5)
simpan(fig,"01_equity_nyata")

# ---------- 2) SETIAP TRADE: return % + alasan keluar ----------
MAP={"model bahaya":"Model bahaya","akhir data":"Batas 9 jam","dump >=5% LP":"Dump likuiditas","stop -40%":"Stop −40%",
     "tanda pucuk":"Tanda pucuk","beli gagal":"Beli gagal","tanpa swap setelah masuk":"Pool mati"}
COL={"Model bahaya":UP,"Batas 9 jam":DN,"Dump likuiditas":BLUE,"Stop −40%":"#F07B3F","Tanda pucuk":VIO,"Beli gagal":MUT,"Pool mati":"#8E4B4B"}
r=np.array([(t["ret"]-1)*100 for t in T]); k=[MAP.get(t["keluar"],t["keluar"]) for t in T]
fig,a=plt.subplots(figsize=(12,4.2))
a.bar(np.arange(1,len(r)+1),r,color=[COL[x] for x in k],width=0.85)
a.axhline(0,color=MUT,lw=0.8); a.set_ylabel("Return per trade %"); a.set_xlabel("Nomor trade")
from matplotlib.patches import Patch
cnt={x:k.count(x) for x in COL if x in k}
a.legend(handles=[Patch(color=COL[x],label=f"{x} ({cnt[x]})") for x in cnt],ncol=4,loc="upper left",fontsize=8.5)
a.set_title("Setiap trade — warna = alasan keluar")
simpan(fig,"02_setiap_trade")

# ---------- 3) ALASAN KELUAR: jumlah & PnL ----------
agg={}
for t,x in zip(T,k): d=agg.setdefault(x,[0,0.0]); d[0]+=1; d[1]+=t["pnl"]
urut=sorted(agg,key=lambda x:agg[x][1])
fig,(a,b)=plt.subplots(1,2,figsize=(12,3.8),gridspec_kw={"wspace":0.45})
a.barh(urut,[agg[x][0] for x in urut],color=[COL[x] for x in urut]); a.set_title("Jumlah trade per alasan keluar"); a.grid(axis="y",visible=False)
for i,x in enumerate(urut): a.text(agg[x][0]+1,i,str(agg[x][0]),va="center",color=TXT,fontsize=8.5)
pv=[agg[x][1] for x in urut]
b.barh(urut,pv,color=[UP if v>0 else DN for v in pv]); b.axvline(0,color=MUT,lw=0.8); b.xaxis.set_major_formatter(usd)
b.set_title("Untung/rugi per alasan keluar"); b.grid(axis="y",visible=False)
fm=lambda v: ("−" if v<0 else "+")+f"${abs(v):,.0f}"
for i,v in enumerate(pv): b.text(250 if v<0 else v+250,i,fm(v),va="center",ha="left",color=TXT,fontsize=8.5)
lo,hi=min(pv),max(pv); b.set_xlim(lo*1.15 if lo<0 else 0,hi*1.3)
simpan(fig,"03_alasan_keluar")

# ---------- 4) SEBARAN RETURN ----------
fig,a=plt.subplots(figsize=(12,3.6))
bins=np.arange(-100,260,10)
a.hist(np.clip(r,-100,255),bins=bins,color=[UP],edgecolor=BG,alpha=0.9)
for p in a.patches:
    if p.get_x()+p.get_width()<=0: p.set_facecolor(DN)
a.axvline(np.median(r),color=GOLD,lw=1.3,ls="--"); a.text(np.median(r)+3,a.get_ylim()[1]*0.9,f"median {np.median(r):+.0f}%",color=GOLD,fontsize=8.5)
a.set_xlabel("Return per trade %"); a.set_ylabel("Jumlah trade"); a.set_title(f"Sebaran return — {int((r>0).sum())} untung, {int((r<=0).sum())} rugi")
simpan(fig,"04_sebaran_return")

# ---------- 5) MONTE CARLO: tiap horizon, 3 skenario, garis beda warna ----------
SC=[("terbaik","Terbaik — pasar ramai"),("realistis","Realistis — pasar campur"),("terburuk","Terburuk — pasar sepi")]
MC={s:json.load(open(f"mc_pro_{s}.json")) for s,_ in SC}
for jam,judul,fn in [(24,"1 hari","05_mc_1hari"),(168,"1 minggu","06_mc_1minggu"),(720,"1 bulan","07_mc_1bulan")]:
    fig,ax=plt.subplots(1,3,figsize=(13,4.3),sharey=True,gridspec_kw={"wspace":0.06})
    for a,(s,nm) in zip(ax,SC):
        m=MC[s]; x=np.arange(0,jam+1)
        cmap=plt.get_cmap("turbo")
        for i,p in enumerate(m["samp"]):
            y=np.array(p[:jam//2+1]); xs=np.arange(len(y))*2
            a.plot(xs/24,y,color=cmap(0.08+0.84*i/len(m["samp"])),lw=0.9,alpha=0.75)
        lo=np.array(m["band"][1][:jam+1]); hi=np.array(m["band"][5][:jam+1]); md=np.array(m["band"][3][:jam+1])
        a.fill_between(x/24,lo,hi,color="white",alpha=0.06)
        a.plot(x/24,md,color="white",lw=2.2); a.axhline(100,color=MUT,lw=0.8,ls="--")
        a.set_yscale("log"); a.yaxis.set_major_formatter(usd); a.set_xlabel("Hari")
        h={24:"h1",168:"h7",720:"h30"}[jam]; v=m[h]
        a.set_title(nm,fontsize=10)
        a.text(0.02,0.97,f"tengah ${v['med']:,.0f}\n5%  ${v['p5']:,.0f}   95% ${v['p95']:,.0f}\nrugi {v['rugi']}%",transform=a.transAxes,va="top",fontsize=8.5,color=TXT,
               bbox=dict(facecolor=BG,edgecolor=GRID,boxstyle="round,pad=0.4"))
    ax[0].set_ylabel("Equity")
    fig.suptitle(f"Monte Carlo 10.000 jalur — {judul}  ·  60 jalur contoh (tiap warna = 1 jalur), garis putih = tengah, pita = 5–95%",x=0.01,ha="left",fontsize=11,fontweight="bold",color=TXT)
    simpan(fig,fn)

# ---------- 6) SEBARAN AKHIR 1 BULAN + DRAWDOWN ----------
C3={"terbaik":UP,"realistis":GOLD,"terburuk":DN}
fig,(a,b)=plt.subplots(1,2,figsize=(12,3.9),gridspec_kw={"wspace":0.25})
for s,nm in SC:
    v=np.array(MC[s]["akhir30"]); a.hist(np.log10(np.maximum(v,1)),bins=70,color=C3[s],alpha=0.55,label=nm.split(" — ")[0])
    d=np.array(MC[s]["ddAll"])*100; b.hist(d,bins=60,color=C3[s],alpha=0.55,label=nm.split(" — ")[0])
a.axvline(2,color=MUT,ls="--",lw=0.8); a.text(2.05,a.get_ylim()[1]*0.9,"modal $100",color=MUT,fontsize=8.5)
a.xaxis.set_major_formatter(FuncFormatter(lambda v,_: usd(10**v,None))); a.set_xlabel("Equity setelah 1 bulan (skala log)"); a.set_ylabel("Jumlah jalur")
a.set_title("Hasil akhir 1 bulan — 10.000 jalur per skenario"); a.legend(fontsize=8.5)
b.axvline(60,color=DN,ls="--",lw=0.9); b.text(59,b.get_ylim()[1]*0.9,"stop darurat 60%",color=DN,fontsize=8.5,ha="right")
b.set_xlabel("Drawdown maksimal %"); b.set_title("Drawdown terdalam per jalur"); b.legend(fontsize=8.5)
simpan(fig,"08_mc_akhir_dd")
print("grafik selesai:",sorted(__import__("os").listdir("viz")))
