// The equations the engine solves, the supporting measurement and estimation formulas, and the
// institutional design, exactly as set out in Phoenix Economics Solutions (6 October 2026). `tex`
// strings are rendered to MathML at build time.

export const EQUATIONS = [
  {
    id: 'E-SURPLUS', n: 1, name: 'Excess stocks and the threshold', sec: '4.2', stage: 'detect',
    tex: String.raw`\frac{dS^k_i}{dt}=I^k_i(t)-\frac{s_k}{12}S^k_i-\Phi^k_i+B^k_i,\qquad I^k_i(t)=\bar e^k_i\,e^{-t/\tau^k_I}`,
    rel: [String.raw`S_i=\sum_k\lambda_kS^k_i,\quad S_{crit,i}(t)=\frac{c_S(L+t/3)}{100}\,Y_i\,c^{cov}_i,\quad \rho_i=\frac{S_i}{S_{crit,i}},\quad \frac{dY_i}{dt}=Y_i\frac{g^*_i+\pi_i}{1200}`],
    what: 'Each sector’s excess deposits grow with new excess inflows, are spent at the rate s_k, fall with absorption and rise when funds return to holders. The threshold is the 90th percentile of pre-2020 accumulations of the same length, re-read as the episode ages.',
  },
  {
    id: 'E-PTAP', n: 2, name: 'Contract activation', sec: '4.3', stage: 'activate',
    tex: String.raw`\frac{d\Theta_i}{dt}=\alpha\,\mathcal H\big(\pi_i-\pi^{eff}_{th,i}\big)\,\frac{(\rho_i-1)^+}{0.25+(\rho_i-1)^+}\,(1-\Theta_i)-\nu\Theta_i`,
    rel: [String.raw`\mathcal H(z)=\frac{1}{1+e^{-z/\epsilon_\pi}}\ \text{or a step with hysteresis band } h_\pi`],
    what: 'Activation rises only when inflation is above the trigger and the excess stock is above its historical threshold; below the threshold the activation term is exactly zero.',
  },
  {
    id: 'E-ABSORB', n: 3, name: 'Absorption', sec: '4.4', stage: 'absorb',
    tex: String.raw`\Phi_i=\min\Big\{g_i\,\Theta_i\,k^{eff}_{A,i}\,\min\Big(\sum_ku_kS^k_i,\ \big(S_i-fS_{crit,i}\big)^+\Big),\ \frac{c\,Y_i}{1200}\Big\}`,
    rel: [String.raw`g_i=\mathrm{sm}\Big(\frac{\pi_i-\pi^*}{\pi_{th}-\pi^*}\Big),\quad \mathrm{sm}(z)=z^2(3-2z),\quad u_{gov}=1,\ u_{nfc}=u_{hh}=1-e^{-r_p/r_0}`],
    what: 'A share k_A of the absorbable stock above the floor is converted each month, limited by voluntary take-up, fading as inflation nears target, and capped at c % of GDP a year.',
  },
  {
    id: 'E-CREDIT', n: 4, name: 'Credits, release, maturity and premium', sec: '4.5', stage: 'convert',
    tex: String.raw`\frac{dC_i}{dt}=\Phi_i-\theta_2\psi_iC_i-\frac{C_i}{M},\qquad \psi_i=\frac{1}{1+e^{-(\pi_{rel}-\pi_i)/\epsilon_\pi}},\qquad P_i=\frac{r_p}{1200}(C_i+L_i)`,
    rel: [],
    what: 'Absorbed funds are held as credits, released into wallets only once inflation is back at the release level, and mature back to holders after M months on average. The premium is the main fiscal cost.',
  },
  {
    id: 'E-WALLET', n: 5, name: 'Wallet liquidity', sec: '4.6', stage: 'redistribute',
    tex: String.raw`\frac{dL_i}{dt}=\theta_2\psi_iC_i+P_i+\sum_j\big(T_{ji}-T_{ij}\big)+D_l\sum_{j\in a(i)}w_{ij}(L_j-L_i)-\eta_cL_i-R_i`,
    rel: [],
    what: 'Wallets receive released credits, premiums and routed liquidity; they lose spending and recall.',
  },
  {
    id: 'E-ROUTE', n: 6, name: 'Routing kernel', sec: '4.6', stage: 'redistribute',
    tex: String.raw`T_{ij}=\tau\,\chi_iL_i\,\frac{K_{ij}}{\sum_{k\ne i,\,k\in a(i)}K_{ik}},\qquad K_{ij}=e^{-d_{ij}^2/2\sigma_i^2}\,n_j\,\omega_j\,\mathbb 1[a(j)=a(i)]`,
    rel: [String.raw`\chi_i=\mathrm{clip}\Big(\frac{\pi_i-\pi^*}{\pi_{th}-\pi^*},0,1\Big),\ \omega_j=\mathrm{clip}\Big(\frac{\pi_{th}-\pi_j}{\pi_{th}-\pi^*},0,1\Big),\ \sigma_i=\sigma_0+\alpha_v\frac{\sum_jw_{ij}|\pi_j-\pi_i|}{\sum_jw_{ij}}`],
    what: 'Wallet liquidity in economies above target moves, only within its currency area, to economies with slack and room below the trigger.',
  },
  {
    id: 'E-RECALL', n: 7, name: 'Saturation and recall', sec: '4.7', stage: 'redistribute',
    tex: String.raw`R_i=\min\Big(\tfrac12L_i,\ r\,\frac{(H_i-H^*)^+}{1-H^*}\,L_i\Big),\qquad H_i=\frac{L_i}{L_{cap,i}},\qquad L_{cap,i}=\frac{\ell}{100}Y_i`,
    rel: [String.raw`\text{into the Dragon reserve if }\pi_i\ge\pi_{crisis};\ \text{else into the Digital Euro up to }\bar E_i,\ \text{the rest to bank accounts}`],
    what: 'When wallets approach capacity the excess is recalled: into the Dragon reserve (held at the central bank) in an inflation crisis, otherwise into the Digital Euro within its holding capacity, with any remainder swept to bank accounts.',
  },
  {
    id: 'E-GAP', n: 8, name: 'Output gap', sec: '4.8', stage: 'stabilise',
    tex: String.raw`\frac{dx_i}{dt}=\lambda_x\big(x^D_i-x_i\big)-\sigma_r\big(i_{a(i)}-\pi^e_i-r^*\big),\qquad x^D_i=x_{i,0}+\frac{100\,m}{Y_i}\Big[12\eta_cL_i-\varphi_{sel}\sum_ks_kU^k_i\Big]`,
    rel: [String.raw`\frac{dU^k_i}{dt}=\Phi^k_i-B^k_i-\frac{s_k}{12}U^k_i,\qquad \pi^e_i=\pi^a_i+\big(\pi_i-\pi^a_i\big)e^{-12a_{R,i}}`],
    what: 'Absorption lowers demand only by the spending the absorbed funds would otherwise have financed; wallet spending raises it; the real interest rate acts on it.',
  },
  {
    id: 'E-PHILLIPS', n: 9, name: 'Energy and core inflation', sec: '4.9', stage: 'stabilise',
    tex: String.raw`\pi_i=w^E_i\,\pi^E_i(t)+\big(1-w^E_i\big)\pi^C_i,\qquad \frac{d\pi^C_i}{dt}=a_R\big(\pi^a_i-\pi^C_i\big)+k_mx_i+k_E\big(\pi^E_i(t)-\bar e\big)\;[-\,k_zz_{a(i)}]`,
    rel: [String.raw`\pi^E_i(t)=100\Big(\frac{I^E_i(t)}{I^E_i(t-12)}-1\Big),\quad a_R=-\frac{\ln(1-a)}{12},\quad k_m=\kappa\frac{a_R}{a},\quad k_E=\gamma_E\frac{a_R}{a}`],
    what: 'Headline inflation is the weighted sum of energy inflation, from the HICP energy index held at its latest level, and core inflation, which follows the Phillips curve estimated by instrumental variables on the EU panel.',
  },
  {
    id: 'E-RATE', n: 10, name: 'Policy rate', sec: '4.10', stage: 'stabilise',
    tex: String.raw`i^T_a(t)=\max\Big\{i_{floor},\ i^{mkt}_a(t)+\phi_\pi\big(\bar\pi_a-\bar\pi^0_a\big)+\phi_x\big(\bar x_a-\bar x^0_a\big)\Big\},\qquad \frac{di_a}{dt}=\lambda_i\big(i^T_a-i_a\big)`,
    rel: [String.raw`i^{mkt}_a:\ \text{euro-area forward curve};\ \text{elsewhere the Taylor rule from the observed rate}`],
    what: 'In the euro area the rate follows the market’s forward path and responds by a Taylor rule only to Phoenix’s own effect on area inflation and output.',
  },
  {
    id: 'E-FEEDBACK', n: 11, name: 'Optional feedback law', sec: '4.11', stage: 'feedback',
    tex: String.raw`\frac{dF_i}{dt}=-\rho_F\dot\pi_i-k_I(\pi_i-\pi^*)-\xi(H_i-H^*)^+-\nu_FF_i`,
    rel: [String.raw`k^{eff}_{A,i}=k_A(1+\gamma\psi^F_i),\quad \pi^{eff}_{th,i}=\pi_{th}-\tfrac12\gamma\psi^F_i,\quad \psi^F_i=\max\big(0,\tanh(-F_i/0.5)\big)`],
    what: 'Inflation above target or accelerating raises the absorption speed and lowers the trigger. The gain γ is zero by default.',
  },
  {
    id: 'E-DISORDER', n: 12, name: 'Loss, disorder index and overhang', sec: '4.12', stage: 'stabilise',
    tex: String.raw`\mathcal L=\frac1T\int_0^T\Big[\big(\pi-\pi^*\big)^2+\omega_xx^2+\omega_S\big((\rho-1)^+\big)^2\Big]dt+\omega_C\frac{100}{Y}\int_0^TP\,dt`,
    rel: [String.raw`\mathcal D_i=(\pi_i-\pi^*)^2+\omega_xx_i^2,\qquad \mathcal O_i=\big((\rho_i-1)^+\big)^2`],
    what: 'A standard central-bank loss plus declared weights on the overhang of the excess stock and on fiscal cost. The disorder index is its macroeconomic part; the overhang is reported separately.',
  },
];

export const SUPPORT = [
  { id: 'M-NET', title: 'Network domain', sec: '4.1',
    tex: String.raw`w_{ij}=\frac{e^{-d_{ij}^2/2\sigma_g^2}}{\max_k\sum_le^{-d_{kl}^2/2\sigma_g^2}},\qquad \nabla\cdot(D\nabla u)\big|_i\to\sum_jw_{ij}D\,(u_j-u_i)` },
  { id: 'M-SECT', title: 'Excess deposits from the financial accounts', sec: '3.2',
    tex: String.raw`S^k_i=\Big(\sum_{q=q_0}^{t}\big(F2^k_{i,q}-\bar\phi^k_i\,Y_{i,q}\big)\Big)^+,\qquad \bar\phi^k_i=\frac{\sum_{q\in2016\text{–}2019}F2^k_{i,q}}{\sum_{q\in2016\text{–}2019}Y_{i,q}}` },
  { id: 'M-CRIT', title: 'Threshold from history', sec: '3.3',
    tex: String.raw`c_S(L)=Q_{0.90}\Big\{\frac{100}{Y^{ann}_{j,s+L-1}}\sum_{q=s}^{s+L-1}\big(F2_{j,q}-\bar\phi_{j,s}Y_{j,q}\big)\Big\}_{j,\;s+L-1\le2019\text{Q4}}` },
  { id: 'M-INFLOW', title: 'Inflow decay by sector', sec: '3.4',
    tex: String.raw`I^k_i(t)=\bar e^k_i\,e^{-t/\tau^k_I},\qquad \tau^k_I=-\frac{12}{\ln\rho^k_A}` },
  { id: 'M-GAP', title: 'Output gap and its monthly update', sec: '3.5',
    tex: String.raw`x_{i,t}=100\big(\ln Y^r_{i,t}-\mathrm{HP}(\ln Y^r_i)_t\big),\qquad x^{now}_i=x_{i,y}-\beta_O\big[(u^{m}_i-\bar u^{y-1}_i)-(\hat u_{i,y}-\hat u_{i,y-1})\big]` },
  { id: 'M-NOW', title: 'Daily inflation nowcast', sec: '3.7',
    tex: String.raw`\pi^{now}_i=\pi^{off}_i+\theta\,w^{E}_i\,\Delta\%P^{oil,\mathrm{EUR}}+\theta_{fx}\,\Delta\%e^{\mathrm{EUR}/\mathrm{USD}}` },
  { id: 'M-PC', title: 'Phillips curve estimated on the EU panel (IV)', sec: '5.1',
    tex: String.raw`\Delta\pi^C_{it}=-a\big(\pi^C_{i,t-1}-\pi^a_i\big)+\kappa\,x_{it}+\gamma_E\big(\pi^E_{it}-\bar e\big)+c_i+e_{it},\quad x_{it}\ \text{instrumented by}\ x_{i,t-1},\ x^{world}_t` },
  { id: 'M-EW', title: 'Early-warning projection', sec: '6.1',
    tex: String.raw`\hat\pi_{t+k}=w^E_y\hat\pi^E_{t+k}+(1-w^E_y)\hat\pi^C_{t+k},\qquad \hat\pi^C_{t+k}=\hat\pi^C_{t+k-1}+0.7^km_t-\hat a_i\big(\hat\pi^C_{t+k-1}-\pi^a_i\big)` },
  { id: 'M-BREACH', title: 'Breach probability (simulated)', sec: '6.1',
    tex: String.raw`p^{br}_i=\frac1N\sum_{n=1}^N\mathbb 1\Big[\max_{k\le12}\big(w^E\pi^{E,(n)}_{t+k}+(1-w^E)\pi^{C,(n)}_{t+k}\big)\ge\pi_{th}\Big],\quad \eta\sim t_\nu` },
  { id: 'M-CONS', title: 'Conservation theorem', sec: '4.13',
    tex: String.raw`\int_0^t\sum_i\big(\Phi_i+P_i\big)ds+\sum_iL_i(0)=\sum_iC_i(t)+\sum_iL_i(t)+\int_0^t\sum_i\Big(\eta_cL_i+\frac{C_i}{M}+R_i\Big)ds` },
  { id: 'M-STAB', title: 'Positivity, Lyapunov certificate and input-to-state gain', sec: '8',
    tex: String.raw`J^\top P+PJ=-I,\ P\succ0,\qquad |z|\le\gamma_{ISS}\sup_t|u(t)|,\quad \gamma_{ISS}=2\lambda_{max}(P)\sqrt{\lambda_{max}(P)/\lambda_{min}(P)}` },
  { id: 'M-PILOT', title: 'Randomised trial: estimator and sample size', sec: '10',
    tex: String.raw`\hat\delta=-\frac{\bar y_T-\bar y_C}{\bar d_T-\bar d_C},\qquad n_{arm}=\frac{\mathrm{DE}\cdot2\,(z_{1-\alpha/2}+z_{1-\beta})^2\,\sigma_y^2(1-R^2)}{\big((p_T-p_C)A\delta\big)^2(1-\mathrm{att})}` },
];

export const ABSORPTION = [
  ['Government', 'Statutory transfer of a share of excess deposits above S_crit into a PHX stabilisation account, in member states that opt in', 'National budget law; the intergovernmental agreement (§2.5)'],
  ['Corporations', 'Voluntary PHX absorption bonds, remunerated at a premium to the deposit rate, maturing after a fixed period', 'Contract; national tax law for any tax treatment'],
  ['Households', 'Voluntary PHX savings wallets, capital-protected and withdrawable, remunerated at a premium while contracts are active', 'Contract; deposit-guarantee and consumer-credit law'],
  ['External surplus, central-bank reserves', 'Not absorbed; monitored only', 'Central-bank independence (Arts. 127 and 130 TFEU)'],
];

export const FLOWS = [
  ['Absorption', 'Contractionary', 'Removes spending power from the surplus-holding sector'],
  ['Premium', 'Expansionary', 'Income to holders, paid from the mandate-holder’s budget'],
  ['Release into wallets and spending', 'Expansionary', 'Only once inflation is at target; bounded by capacity and recall'],
  ['Maturity', 'Neutral relative to the start', 'Returns funds to holders’ bank accounts'],
  ['Routing between economies', 'Neutral in total', 'Moves spending power within a currency area towards slack'],
  ['Recall into the Digital Euro or bank accounts', 'Neutral', 'A change of form'],
  ['Recall into the Dragon reserve', 'Contractionary', 'Held as deposits at the central bank: sterilised'],
];

export const GOVERNANCE = [
  'Publishes the parameter set, the threshold method and the loss weights in advance.',
  'May suspend contracts in an emergency; every suspension is recorded in the ledger.',
  'Reviews the cap, the premium and the release rule annually against the evidence and the trials.',
  'Commissions independent verification of the ledger.',
  'Reports outcomes against the no-Phoenix counterfactual and the randomised trials.',
];

// Provenance codes of Solutions Table 6.
export const PROV_LABEL = { D: 'Estimated from data', L: 'Empirical literature', P: 'Policy design choice', M: 'To be measured by the trials', N: 'Numerical setting' };
