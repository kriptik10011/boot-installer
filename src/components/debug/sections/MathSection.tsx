/**
 * MathSection Component
 *
 * Comprehensive documentation of ALL intelligence algorithms used in the app.
 * Each algorithm is explained with:
 * - Plain English description
 * - Mathematical formula
 * - Current values from the app
 * - Example calculations
 * - When/why it's used
 *
 * Algorithms documented:
 * 1. ADWIN (Adaptive Windowing) - Drift detection
 * 2. EWMA (Exponentially Weighted Moving Average) - Trend smoothing
 * 3. Shrinkage Blending - Cold start personalization
 * 4. Interruption Calculus - Surfacing decisions
 * 5. Context Gating - Binary permission gates
 * 6. Bayesian Surprise - Summary filtering (z-score based)
 * 7. Hoeffding Bound - Statistical significance for drift
 * 8. Welford's Algorithm - Online variance calculation
 * 9. Markov Chains - Next-action prediction (V1)
 * 10. Confidence Growth/Decay - Pattern confidence over time
 */

import { useState } from 'react';
import { DebugCard } from '../shared';
import { HelpTooltip } from '../shared/HelpTooltip';

type MathTab =
  | 'overview'
  | 'adwin'
  | 'ewma'
  | 'shrinkage'
  | 'interruption'
  | 'gates'
  | 'surprise'
  | 'hoeffding'
  | 'welford'
  | 'markov'
  | 'confidence';

interface AlgorithmCardProps {
  title: string;
  purpose: string;
  formula: string;
  formulaExplanation: string;
  example: {
    scenario: string;
    calculation: string;
    result: string;
  };
  usedFor: string[];
  codeLocation: string;
  relatedDecision?: string;
}

function AlgorithmCard({
  title,
  purpose,
  formula,
  formulaExplanation,
  example,
  usedFor,
  codeLocation,
  relatedDecision,
}: AlgorithmCardProps) {
  const [showExample, setShowExample] = useState(false);

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <h3 className="text-lg font-semibold text-cyan-400">{title}</h3>
        {relatedDecision && (
          <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-400">
            Decision: {relatedDecision}
          </span>
        )}
      </div>

      {/* Purpose */}
      <p className="text-slate-300 text-sm">{purpose}</p>

      {/* Formula */}
      <div className="bg-slate-900 rounded p-3 font-mono text-sm">
        <div className="text-amber-400 mb-2">{formula}</div>
        <div className="text-slate-500 text-xs">{formulaExplanation}</div>
      </div>

      {/* Example Toggle */}
      <button
        onClick={() => setShowExample(!showExample)}
        className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors"
      >
        {showExample ? '▼ Hide Example' : '▶ Show Example'}
      </button>

      {/* Example */}
      {showExample && (
        <div className="bg-slate-900/50 rounded p-3 text-sm space-y-2 border-l-2 border-cyan-500/30">
          <div className="text-slate-400">Scenario: {example.scenario}</div>
          <div className="font-mono text-slate-300">{example.calculation}</div>
          <div className="text-emerald-400">→ {example.result}</div>
        </div>
      )}

      {/* Used For */}
      <div>
        <div className="text-xs text-slate-500 mb-1">Used for:</div>
        <div className="flex flex-wrap gap-1">
          {usedFor.map((use, i) => (
            <span
              key={i}
              className="text-xs bg-slate-700/50 px-2 py-0.5 rounded text-slate-400"
            >
              {use}
            </span>
          ))}
        </div>
      </div>

      {/* Code Location */}
      <div className="text-xs text-slate-600">
        📁 {codeLocation}
      </div>
    </div>
  );
}

function OverviewTab() {
  return (
    <div className="space-y-4">
      <DebugCard title="Intelligence Pipeline Overview">
        <div className="text-sm text-slate-300 space-y-4">
          <p>
            The intelligence layer uses <span className="text-cyan-400">statistical algorithms</span>,
            not machine learning. All computation runs locally, is deterministic, and can be debugged.
          </p>

          {/* Pipeline Diagram */}
          <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs">
            <div className="grid grid-cols-5 gap-2 text-center">
              <div className="bg-cyan-500/20 rounded p-2 border border-cyan-500/30">
                <div className="text-cyan-400 font-bold">OBSERVE</div>
                <div className="text-slate-500 mt-1">Welford</div>
              </div>
              <div className="bg-amber-500/20 rounded p-2 border border-amber-500/30">
                <div className="text-amber-400 font-bold">INFER</div>
                <div className="text-slate-500 mt-1">ADWIN, EWMA</div>
              </div>
              <div className="bg-purple-500/20 rounded p-2 border border-purple-500/30">
                <div className="text-purple-400 font-bold">DECIDE</div>
                <div className="text-slate-500 mt-1">Gates, Calculus</div>
              </div>
              <div className="bg-emerald-500/20 rounded p-2 border border-emerald-500/30">
                <div className="text-emerald-400 font-bold">SURFACE</div>
                <div className="text-slate-500 mt-1">Surprise, Escalation</div>
              </div>
              <div className="bg-rose-500/20 rounded p-2 border border-rose-500/30">
                <div className="text-rose-400 font-bold">ADAPT</div>
                <div className="text-slate-500 mt-1">Shrinkage</div>
              </div>
            </div>
          </div>

          {/* Algorithm Summary Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-700">
                  <th className="py-2 pr-4">Algorithm</th>
                  <th className="py-2 pr-4">Purpose</th>
                  <th className="py-2 pr-4">Complexity</th>
                  <th className="py-2">Key Parameter</th>
                </tr>
              </thead>
              <tbody className="text-slate-400">
                <tr className="border-b border-slate-800">
                  <td className="py-2 pr-4 text-cyan-400">ADWIN</td>
                  <td className="py-2 pr-4">Drift detection</td>
                  <td className="py-2 pr-4">O(log n)</td>
                  <td className="py-2">δ = 0.002</td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-2 pr-4 text-cyan-400">EWMA</td>
                  <td className="py-2 pr-4">Trend smoothing</td>
                  <td className="py-2 pr-4">O(1)</td>
                  <td className="py-2">α = 0.3</td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-2 pr-4 text-cyan-400">Shrinkage</td>
                  <td className="py-2 pr-4">Cold start handling</td>
                  <td className="py-2 pr-4">O(1)</td>
                  <td className="py-2">n = 20 full trust</td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-2 pr-4 text-cyan-400">Bayesian Surprise</td>
                  <td className="py-2 pr-4">Summary filtering</td>
                  <td className="py-2 pr-4">O(1)</td>
                  <td className="py-2">z &gt; 2.0</td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-2 pr-4 text-cyan-400">Interruption Calculus</td>
                  <td className="py-2 pr-4">Surfacing decisions</td>
                  <td className="py-2 pr-4">O(1)</td>
                  <td className="py-2">threshold = 0.3</td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-2 pr-4 text-cyan-400">Hoeffding Bound</td>
                  <td className="py-2 pr-4">Statistical significance</td>
                  <td className="py-2 pr-4">O(1)</td>
                  <td className="py-2">ε = √(ln(2/δ)/2m)</td>
                </tr>
                <tr className="border-b border-slate-800">
                  <td className="py-2 pr-4 text-cyan-400">Welford's</td>
                  <td className="py-2 pr-4">Online variance</td>
                  <td className="py-2 pr-4">O(1)</td>
                  <td className="py-2">Single-pass</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-cyan-400">Markov Chain</td>
                  <td className="py-2 pr-4">Next-action prediction</td>
                  <td className="py-2 pr-4">O(1) lookup</td>
                  <td className="py-2">decay α = 0.1</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </DebugCard>

      <DebugCard title="Why NOT Machine Learning?">
        <div className="text-sm text-slate-400 space-y-2">
          <p>
            <span className="text-amber-400">Privacy:</span> All computation is local.
            No data leaves your device. No cloud model training.
          </p>
          <p>
            <span className="text-amber-400">Debuggability:</span> Every decision can be traced.
            "Why did the app show this?" has a deterministic answer.
          </p>
          <p>
            <span className="text-amber-400">Explainability:</span> We can tell you exactly
            why something is "surprising" or why a pattern was detected.
          </p>
          <p>
            <span className="text-amber-400">Efficiency:</span> These algorithms run in
            milliseconds on any device. No GPU required.
          </p>
        </div>
      </DebugCard>
    </div>
  );
}

export function MathSection() {
  const [activeTab, setActiveTab] = useState<MathTab>('overview');

  const tabs: { id: MathTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'adwin', label: 'ADWIN' },
    { id: 'ewma', label: 'EWMA' },
    { id: 'shrinkage', label: 'Shrinkage' },
    { id: 'interruption', label: 'Interruption' },
    { id: 'gates', label: 'Gates' },
    { id: 'surprise', label: 'Surprise' },
    { id: 'hoeffding', label: 'Hoeffding' },
    { id: 'welford', label: 'Welford' },
    { id: 'markov', label: 'Markov' },
    { id: 'confidence', label: 'Confidence' },
  ];

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-1 border-b border-slate-700 pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              activeTab === tab.id
                ? 'bg-slate-700 text-cyan-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab />}

      {activeTab === 'adwin' && (
        <AlgorithmCard
          title="ADWIN (Adaptive Windowing)"
          purpose="Detects when user behavior has fundamentally changed (concept drift). Unlike z-scores which flag every deviation, ADWIN distinguishes between 'one-off anomaly' and 'new normal'. When drift is detected, old data is automatically forgotten."
          formula="ε = √(ln(2/δ) / 2m)"
          formulaExplanation="If |μ₁ - μ₂| > ε, drift detected. δ=0.002 (confidence), m=harmonic mean of sub-window sizes"
          example={{
            scenario: "User's wake time shifted from 7am to 9am over 2 weeks",
            calculation: "Old window mean: 7.0h, New window mean: 9.0h, ε ≈ 0.8h → |9.0-7.0| > 0.8",
            result: "Drift detected! Window shrinks to keep only recent (9am) data. 'Your schedule has shifted.'"
          }}
          usedFor={['Wake time patterns', 'Spending baselines', 'Planning time detection', 'Activity levels']}
          codeLocation="backend/app/services/pattern_detection/adwin.py"
          relatedDecision="Pattern Learning (Matrix Profiles + ADWIN)"
        />
      )}

      {activeTab === 'ewma' && (
        <AlgorithmCard
          title="EWMA (Exponentially Weighted Moving Average)"
          purpose="Smooths out daily volatility in metrics like spending. Recent values matter more than old ones. Creates a 'momentum' indicator that responds to trends without overreacting to noise."
          formula="EWMA[t] = α × value[t] + (1 - α) × EWMA[t-1]"
          formulaExplanation="α = 0.3 (smoothing factor). Higher α = more responsive to recent. Lower α = more stable."
          example={{
            scenario: "Weekly spending: $100, $150, $200, $180",
            calculation: "EWMA[1]=100, EWMA[2]=0.3×150+0.7×100=115, EWMA[3]=0.3×200+0.7×115=140.5, EWMA[4]=0.3×180+0.7×140.5=152.35",
            result: "Smoothed trend: $152.35 (doesn't overreact to the $200 spike)"
          }}
          usedFor={['Spending trend analysis', 'Productivity scores', 'Session duration trends']}
          codeLocation="src/hooks/usePatterns.ts, backend/app/services/pattern_detection"
          relatedDecision="Confidence Growth Rate"
        />
      )}

      {activeTab === 'shrinkage' && (
        <AlgorithmCard
          title="Shrinkage Blending (Cold Start)"
          purpose="Handles the 'leather boot' problem: new users have no history. We blend template defaults with user data, gradually trusting the user more as evidence grows. Prevents showing broken/empty experiences in week 1."
          formula="result = (shrinkage × user_value) + ((1 - shrinkage) × global_default)"
          formulaExplanation="shrinkage = min(1.0, sample_size / 20). At 20 samples, user is fully trusted."
          example={{
            scenario: "New user with 5 sessions, average planning time 8pm. Default is 6pm.",
            calculation: "shrinkage = 5/20 = 0.25 → 0.25 × 20:00 + 0.75 × 18:00 = 18:30",
            result: "Show 6:30pm as planning time (75% default, 25% user)"
          }}
          usedFor={['Planning time', 'Busy days', 'Spending thresholds', 'All personalized features']}
          codeLocation="backend/app/services/pattern_detection/cold_start.py"
          relatedDecision="Low Confidence Learning State"
        />
      )}

      {activeTab === 'interruption' && (
        <AlgorithmCard
          title="Interruption Calculus"
          purpose="Decides whether to show an insight to the user. Balances the benefit of showing (urgency × confidence) against the cost of interrupting (annoyance from past dismissals)."
          formula="Score = (Confidence × Benefit) - Annoyance_Cost"
          formulaExplanation="Show if Score ≥ 0.3. Benefit from priority (P1=1.0, P2=0.8, P3=0.5). Annoyance = 0.1 + (dismissals × 0.15)."
          example={{
            scenario: "Bill due tomorrow (P1), confidence 0.8, dismissed once before",
            calculation: "Benefit=1.0, Annoyance=0.1+0.15=0.25 → Score = (0.8 × 1.0) - 0.25 = 0.55",
            result: "Show! Score 0.55 > threshold 0.3"
          }}
          usedFor={['All insight surfacing', 'Notification decisions', 'Card visibility']}
          codeLocation="src/utils/surfacing.ts"
          relatedDecision="Escalation Triggers"
        />
      )}

      {activeTab === 'gates' && (
        <AlgorithmCard
          title="Context Gating"
          purpose="Binary checks that run BEFORE Interruption Calculus. If ANY gate fails, the insight is blocked regardless of score. 'Gating beats Guessing' - no confidence score can override a closed gate."
          formula="shouldShow = Gate1 AND Gate2 AND Gate3 AND Gate4"
          formulaExplanation="Gates: DND mode?, Mid-task?, Idle too long?, Living mode? Each is true/false."
          example={{
            scenario: "High-priority bill reminder, but user is in DND mode",
            calculation: "Gate 'DND mode off?' = FALSE (DND is on)",
            result: "BLOCKED. Gates failed, Interruption Calculus never runs."
          }}
          usedFor={['DND/Focus mode', 'Mid-task protection', 'Living vs Planning mode', 'Cooking mode']}
          codeLocation="src/utils/surfacing.ts (checkContextGates)"
          relatedDecision="Cooking Mode Notification Rules"
        />
      )}

      {activeTab === 'surprise' && (
        <AlgorithmCard
          title="Bayesian Surprise (Z-Score)"
          purpose="Filters summaries to only show items that would change the user's mental model. Unlike Shannon Entropy (which measures randomness), Bayesian Surprise measures how much the observation deviates from the user's personal normal."
          formula="z-score = |value - μ| / σ"
          formulaExplanation="Surface if z > 2.0 (outside 95% of user's normal). μ=mean, σ=std dev from Welford's algorithm."
          example={{
            scenario: "User's average grocery spend: $50±$10. New purchase: $105.",
            calculation: "z = |105 - 50| / 10 = 5.5",
            result: "SURPRISING! z=5.5 > 2.0. Highlight: '5.5σ above your grocery average'"
          }}
          usedFor={['Weekly summary filtering', 'Expense highlights', 'Anomaly detection']}
          codeLocation="src/utils/surprise.ts"
          relatedDecision="Bayesian Surprise for Summary Filtering"
        />
      )}

      {activeTab === 'hoeffding' && (
        <AlgorithmCard
          title="Hoeffding Bound"
          purpose="Provides a statistical guarantee for ADWIN drift detection. Determines how different two sub-window means must be to conclude (with high confidence) that a real change occurred, not just random noise."
          formula="ε = √(ln(2/δ) / 2m)"
          formulaExplanation="δ=0.002 (false positive rate), m=harmonic mean of sample sizes. Smaller δ = more conservative."
          example={{
            scenario: "Comparing two windows of wake times: n1=15, n2=10",
            calculation: "m = 1/(1/15 + 1/10) = 6, ε = √(ln(2/0.002) / 12) = √(6.9/12) ≈ 0.76",
            result: "Means must differ by >0.76 hours to declare drift"
          }}
          usedFor={['ADWIN drift detection', 'Pattern stability checks']}
          codeLocation="backend/app/services/pattern_detection/adwin.py"
        />
      )}

      {activeTab === 'welford' && (
        <AlgorithmCard
          title="Welford's Online Algorithm"
          purpose="Computes mean and variance in a single pass without storing all values. Numerically stable (doesn't accumulate floating point errors). Essential for Bayesian Surprise calculations."
          formula="δ = x - μ, μ' = μ + δ/n, δ₂ = x - μ', σ² = (σ²×(n-1) + δ×δ₂) / n"
          formulaExplanation="Single-pass, O(1) memory. Each new value updates running mean and variance."
          example={{
            scenario: "Observations: 50, 60, 40. Compute mean and variance incrementally.",
            calculation: "n=1: μ=50, σ²=0 | n=2: μ=55, σ²=25 | n=3: μ=50, σ²=66.67",
            result: "Mean=50, Std Dev=8.16 (computed without storing all values)"
          }}
          usedFor={['Bayesian Surprise', 'All running statistics', 'Spending models', 'Time models']}
          codeLocation="src/utils/surprise.ts (updateModel)"
        />
      )}

      {activeTab === 'markov' && (
        <AlgorithmCard
          title="Markov Chain (Transition Matrix)"
          purpose="Predicts the user's next action based on their current screen. Stores transition probabilities: 'If user is on MealPanel, 80% likely they'll go to RecipeSearch next.' Enables prefetching and shortcut suggestions."
          formula="P(Next=j | Current=i) = Count(i→j) / Count(i)"
          formulaExplanation="Decay update: P_new = (1-α)×P_old + α×Current where α=0.1. Recent behavior matters more."
          example={{
            scenario: "User visited MealPanel 10 times. 8 times went to RecipeSearch, 2 to ShoppingList.",
            calculation: "P(RecipeSearch | MealPanel) = 8/10 = 0.8, P(ShoppingList | MealPanel) = 2/10 = 0.2",
            result: "Predict: 80% RecipeSearch → preload recipe data"
          }}
          usedFor={['Resource prefetching', 'Shortcut suggestions', 'Workflow detection']}
          codeLocation="backend/app/services/pattern_detection/transitions.py (V1)"
          relatedDecision="Markov Transition Tracking (CPT-Ready)"
        />
      )}

      {activeTab === 'confidence' && (
        <AlgorithmCard
          title="Confidence Growth/Decay"
          purpose="Tracks how confident we are in detected patterns. Confidence grows with consistent observations and decays when patterns are missed. Prevents surfacing unreliable insights."
          formula="Growth: +0.15/consistent week | Decay: -0.05/missed week"
          formulaExplanation="Threshold: 0.5 to surface. Max: 0.95 (never certain). Reaches threshold in ~3-4 weeks."
          example={{
            scenario: "User plans on Sunday 3 weeks in a row, then misses week 4.",
            calculation: "Week 1: 0.15, Week 2: 0.30, Week 3: 0.45, Week 4 (missed): 0.40",
            result: "Still not surfaced (0.40 < 0.50). Needs one more consistent week."
          }}
          usedFor={['Pattern surfacing', 'Planning time detection', 'Habit formation']}
          codeLocation="intelligence-decisions.md, backend/app/services/pattern_detection"
          relatedDecision="Confidence Growth Rate"
        />
      )}

      {/* V2 Upgrades Preview */}
      <DebugCard title="🚀 V2 Intelligence Upgrades (Coming Soon)">
        <div className="text-xs text-slate-500 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-amber-400">CPT:</span>
            <span>Compact Prediction Trees will replace Markov chains. Remembers full sequences (A→B→C→D) instead of just current state.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-400">Hawkes:</span>
            <span>Self-exciting processes for "bursty" behavior. Detects "in the zone" states in real-time.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-400">Info Bottleneck:</span>
            <span>Mathematically optimal UI simplicity: min(I(X;T) - β×I(T;Y)).</span>
          </div>
        </div>
      </DebugCard>
    </div>
  );
}
