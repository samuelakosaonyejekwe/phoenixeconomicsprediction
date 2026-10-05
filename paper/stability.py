# Stability of the linearised euro-area network (Phoenix Economics Solutions §8): eigenvalues of the
# 43-dimensional core (21 output gaps, 21 core inflation rates, one policy rate), a quadratic Lyapunov
# function V = zᵀPz solving JᵀP + PJ = −I (P positive definite certifies stability), and the
# input-to-state gain bound. Reads and updates paper/results-2026-10-04.json.
import json, os, sys, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); F = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'results-2026-10-04.json')
o = json.load(open(F)); s = o['stabInputs']
cells = s['cells']; N = len(cells); w = np.array([c['w'] for c in cells]); w = w / w.sum(); aR = np.array([c['aR'] for c in cells])
def J(km, tPi, aRv):
    n = 2 * N + 1; M = np.zeros((n, n))
    for i in range(N):
        M[i, i] = -s['lamX']; M[i, N + i] = s['sigR'] * np.exp(-12 * aRv[i]); M[i, 2 * N] = -s['sigR']
        M[N + i, N + i] = -aRv[i]; M[N + i, i] = km
        M[2 * N, N + i] = s['lamI'] * tPi * w[i]; M[2 * N, i] = s['lamI'] * s['tX'] * w[i]
    M[2 * N, 2 * N] = -s['lamI']; return M
def lyap(A):
    n = A.shape[0]; K = np.kron(np.eye(n), A.T) + np.kron(A.T, np.eye(n))
    P = np.linalg.solve(K, -np.eye(n).reshape(-1)).reshape(n, n); return (P + P.T) / 2
kap = o['phillips']['full']['iv']; k0 = kap['kappa']; res = {}
for name, km, tPi, aRv in [('default', s['km'], 1.5, aR), ('kappa_upper', s['km'] * (k0 + 2 * kap['kappaSe']) / k0, 1.5, aR), ('kappa_0.25', s['km'] * 0.25 / k0, 1.5, aR),
                           ('no_anchor', s['km'], 1.5, aR * 0), ('no_anchor_strong_taylor', s['km'], 3.0, aR * 0)]:
    A = J(km, tPi, aRv); ev = np.linalg.eigvals(A); mx = ev.real.max()
    r = {'maxReal': float(mx), 'halfLife': (float(np.log(2) / -mx) if mx < 0 else None), 'maxImag': float(abs(ev.imag).max())}
    if mx < 0:
        P = lyap(A); lam = np.linalg.eigvalsh(P)
        r.update({'lyapunovMinEig': float(lam.min()), 'lyapunovMaxEig': float(lam.max()), 'issGain': float(2 * lam.max() ** 1.5 / lam.min() ** 0.5)})
    res[name] = r
o['stability'] = res; json.dump(o, open(F, 'w'), indent=1); print(json.dumps(res, indent=1))
