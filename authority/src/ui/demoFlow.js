/* ==========================================================================
   RakshaSetu Authority - Guided Demonstration Controller
   Coordinates the exact 11-step emergency lifecycle:
   "Receive -> Locate -> Prioritize -> Assign -> Respond -> Resolve"
   Fully operational in DEMO mode and resilient in API mode.
   ========================================================================== */

import { state } from '../state/state.js';

function getDemoIncidentId() {
  return state.selectedIncidentId || (state.incidents && state.incidents.length > 0 ? state.incidents[0].id : null);
}

function getDemoResourceId() {
  return state.selectedResourceId || (state.resourceRequests && state.resourceRequests.length > 0 ? state.resourceRequests[0].id : null);
}

export const DEMO_STEPS = [
  {
    stepNumber: 1,
    title: "1. Citizen Triggers Emergency SOS",
    actionDesc: "Citizen presses SOS on device amidst rising floodwaters.",
    buttonLabel: "Simulate Citizen SOS",
    execute: async () => {
      state.setActiveTab('dashboard');
      const inc = await state.simulateNewCitizenSOS();
      if (inc && inc.id) {
        state.selectedIncidentId = inc.id;
      }
    }
  },
  {
    stepNumber: 2,
    title: "2. Authority Dashboard Ingests Signal",
    actionDesc: "Critical SOS alert flashes across Top KPIs, queue, and tactical map.",
    buttonLabel: "View Critical Alert",
    execute: () => {
      state.setActiveTab('dashboard');
      const kpi = document.querySelector('.kpi-card.critical');
      if (kpi) {
        kpi.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.8)';
        setTimeout(() => kpi.style.boxShadow = '', 2000);
      }
    }
  },
  {
    stepNumber: 3,
    title: "3. Locate: Position & Accuracy Checked",
    actionDesc: "Operator inspects position: 'LAST-KNOWN LOCATION (Updated 2m ago, ±18m accuracy)'.",
    buttonLabel: "Focus Incident On Map",
    execute: () => {
      const incId = getDemoIncidentId();
      const inc = incId ? state.getIncident(incId) : null;
      if (inc && inc.coordinates && window.__rakshaMap && window.__rakshaMap.mainMap) {
        window.__rakshaMap.mainMap.flyTo(inc.coordinates, 15, { duration: 1 });
      }
    }
  },
  {
    stepNumber: 4,
    title: "4. Telemetry: Heartbeat & SMS Network",
    actionDesc: "Operator checks pre-blackout heartbeat: Status Recent (2m 14s), SMS Fallback (2G).",
    buttonLabel: "Verify Telemetry",
    execute: () => {
      const incId = getDemoIncidentId();
      if (incId) state.openIncidentDrawer(incId);
    }
  },
  {
    stepNumber: 5,
    title: "5. Open Operations Drawer",
    actionDesc: "Slide-over drawer reveals distress message, medical alert, and response timeline.",
    buttonLabel: "Inspect Details",
    execute: () => {
      const incId = getDemoIncidentId();
      if (incId) state.openIncidentDrawer(incId);
    }
  },
  {
    stepNumber: 6,
    title: "6. Assign Rescue Team",
    actionDesc: "Operator opens dispatch modal and deploys SDRF Unit 1 (Alpha) with inflatable boat.",
    buttonLabel: "Trigger Team Dispatch",
    execute: () => {
      const incId = getDemoIncidentId();
      if (incId && window.__rakshaModal) {
        window.__rakshaModal.openTeamAssignment(incId);
      }
    }
  },
  {
    stepNumber: 7,
    title: "7. Response Progression: Responding",
    actionDesc: "Status transitions: Assigned -> Responding (Team en route via Munger bypass).",
    buttonLabel: "Mark Responding",
    execute: async () => {
      const incId = getDemoIncidentId();
      if (incId) {
        await state.updateIncidentStatus(incId, 'Responding', 'Boat team deployed from Munger advance staging.');
      }
    }
  },
  {
    stepNumber: 8,
    title: "8. On Scene: Reached",
    actionDesc: "SDRF Unit reaches rooftop slab; starts victim evacuation.",
    buttonLabel: "Mark Reached",
    execute: async () => {
      const incId = getDemoIncidentId();
      if (incId) {
        await state.updateIncidentStatus(incId, 'Reached', 'Rooftop contact established; evacuees secure.');
      }
    }
  },
  {
    stepNumber: 9,
    title: "9. Resolve: Rescue Mission Closed",
    actionDesc: "Evacuees safely relocated to shelter camp; incident marked Resolved.",
    buttonLabel: "Mark Resolved",
    execute: async () => {
      const incId = getDemoIncidentId();
      if (incId) {
        await state.updateIncidentStatus(incId, 'Resolved', 'Evacuees transported to safety.');
      }
    }
  },
  {
    stepNumber: 10,
    title: "10. Citizen Creates Resource Need",
    actionDesc: "Inspect high-priority water & medical supply requests.",
    buttonLabel: "View Resource Request",
    execute: () => {
      state.setActiveTab('resources');
      const resId = getDemoResourceId();
      if (resId) state.openResourceDrawer(resId);
    }
  },
  {
    stepNumber: 11,
    title: "11. Prioritize & Assign Logistics",
    actionDesc: "Explainable Nearest-Need-First Prioritization assigns logistics unit.",
    buttonLabel: "Fulfill Resource Flow",
    execute: async () => {
      const resId = getDemoResourceId();
      if (resId) {
        await state.updateResourceStatus(resId, 'Assigned', 'Civil Defense Logistics Unit');
      }
      state.setActiveTab('dashboard');
      state.addNotification({
        title: "Demo Flow Completed",
        message: "Complete lifecycle demonstrated: Receive -> Locate -> Prioritize -> Assign -> Respond -> Resolve.",
        type: "success"
      });
    }
  }
];

class DemoFlowController {
  constructor() {
    this.currentStepIdx = 0;
    this.containerEl = null;
  }

  init() {
    this.containerEl = document.getElementById('demo-controller');
    this.render();
  }

  render() {
    if (!this.containerEl) return;
    const step = DEMO_STEPS[this.currentStepIdx];

    this.containerEl.innerHTML = `
      <div class="demo-flow-label">
        <span>⚡ Demo Flow (${step.stepNumber}/11):</span>
      </div>
      <div class="demo-step-text" title="${step.title}: ${step.actionDesc}">
        <strong>${step.title}:</strong> ${step.actionDesc}
      </div>
      <div class="demo-btn-group">
        <button class="demo-action-btn" id="demo-exec-step-btn">
          ${step.buttonLabel} &rarr;
        </button>
        ${this.currentStepIdx > 0 ? `
          <button class="demo-action-btn secondary" id="demo-prev-step-btn" title="Previous Step">
            &larr;
          </button>
        ` : ''}
        <button class="demo-action-btn secondary" id="demo-reset-flow-btn" title="Reset Demo">
          ↺
        </button>
      </div>
    `;

    document.getElementById('demo-exec-step-btn').addEventListener('click', async () => {
      await step.execute();
      this.nextStep();
    });

    const prevBtn = document.getElementById('demo-prev-step-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.currentStepIdx = Math.max(0, this.currentStepIdx - 1);
        this.render();
      });
    }

    document.getElementById('demo-reset-flow-btn').addEventListener('click', () => {
      this.currentStepIdx = 0;
      this.render();
    });
  }

  nextStep() {
    this.currentStepIdx = (this.currentStepIdx + 1) % DEMO_STEPS.length;
    this.render();
  }
}

export const demoFlow = new DemoFlowController();
window.__rakshaDemo = demoFlow;
