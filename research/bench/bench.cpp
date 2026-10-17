// Same algorithm in C++ (f32 compare, f64 sum).
#include <chrono>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <vector>
struct Tree { std::vector<int> feat; std::vector<float> border; std::vector<double> leaf; };
int main() {
  std::ifstream m("model.txt"); int n; double scale, bias; m >> n >> scale >> bias;
  std::vector<Tree> trees(n);
  for (auto& t : trees) { int d; m >> d; t.feat.resize(d); t.border.resize(d); t.leaf.resize(1 << d);
    for (auto& f : t.feat) m >> f; for (auto& b : t.border) { double v; m >> v; b = (float)v; } for (auto& l : t.leaf) m >> l; }
  std::ifstream xf("x.bin", std::ios::binary | std::ios::ate); size_t bytes = xf.tellg(); xf.seekg(0);
  std::vector<double> x(bytes / 8); xf.read((char*)x.data(), bytes);
  const int nf = 34; size_t nv = x.size() / nf; const int reps = 200; double chk = 0;
  auto t0 = std::chrono::steady_clock::now();
  for (int r = 0; r < reps; ++r)
    for (size_t v = 0; v < nv; ++v) {
      const double* row = &x[v * nf]; double s = 0;
      for (const auto& t : trees) { unsigned idx = 0;
        for (size_t k = 0; k < t.feat.size(); ++k) if ((float)row[t.feat[k]] > t.border[k]) idx |= 1u << k;
        s += t.leaf[idx]; }
      chk += 1.0 / (1.0 + std::exp(-(scale * s + bias)));
    }
  double ns = std::chrono::duration<double, std::nano>(std::chrono::steady_clock::now() - t0).count() / (reps * nv);
  std::printf("C++   %zu vectors x %d reps | %.1f ns per prediction | checksum %.12f\n", nv, reps, ns, chk / reps);
}
