/* ==========================================================================
   RakshaSetu Authority - Notification Center & Toast System
   Section 14: Real-Time Operational Alerts with Direct Drawer Links
   ========================================================================== */

import { state } from '../state/state.js';

class NotificationSystem {
  constructor() {
    this.toastContainer = null;
    this.dropdownEl = null;
    this.badgeEl = null;
    this.bellBtn = null;
  }

  init() {
    this.toastContainer = document.getElementById('toast-container');
    this.dropdownEl = document.getElementById('notification-dropdown');
    this.badgeEl = document.getElementById('header-notif-count');
    this.bellBtn = document.getElementById('header-notif-btn');

    if (this.bellBtn) {
      this.bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      });
    }

    document.addEventListener('click', (e) => {
      if (this.dropdownEl && !this.dropdownEl.contains(e.target) && e.target !== this.bellBtn) {
        this.dropdownEl.classList.remove('open');
      }
    });

    state.subscribe('notificationAdded', (notif) => {
      this.showToast(notif);
      this.renderBadge();
      this.renderDropdown();
    });

    state.subscribe('notificationsRead', () => {
      this.renderBadge();
      this.renderDropdown();
    });

    this.renderBadge();
    this.renderDropdown();
  }

  toggleDropdown() {
    if (!this.dropdownEl) return;
    const isOpen = this.dropdownEl.classList.toggle('open');
    if (isOpen) {
      this.renderDropdown();
    }
  }

  renderBadge() {
    if (!this.badgeEl) return;
    const unreadCount = state.notifications.filter(n => n.unread).length;
    if (unreadCount > 0) {
      this.badgeEl.textContent = unreadCount;
      this.badgeEl.style.display = 'flex';
    } else {
      this.badgeEl.style.display = 'none';
    }
  }

  renderDropdown() {
    if (!this.dropdownEl) return;
    const unreadCount = state.notifications.filter(n => n.unread).length;

    this.dropdownEl.innerHTML = `
      <div class="notif-header">
        <span>Operations Notification Center</span>
        ${unreadCount > 0 ? `
          <button style="background: transparent; border: none; font-size: 11px; color: var(--brand-primary); cursor: pointer;" onclick="window.__rakshaState.markAllNotificationsRead()">
            Mark All Read
          </button>
        ` : ''}
      </div>
      <div class="notif-list">
        ${state.notifications.map(n => `
          <div class="notif-item ${n.unread ? 'unread' : ''}" onclick="window.__rakshaNotif.handleNotifClick('${n.id}')">
            <div class="notif-title">
              <span>${n.type === 'critical' ? '🚨' : (n.type === 'warning' ? '⚠️' : 'ℹ️')}</span>
              <span>${n.title}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.3;">
              ${n.message}
            </div>
            <div class="notif-time">${n.time}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  handleNotifClick(notifId) {
    const notif = state.notifications.find(n => n.id === notifId);
    if (!notif) return;

    notif.unread = false;
    this.renderBadge();
    this.renderDropdown();

    if (notif.incidentId) {
      state.openIncidentDrawer(notif.incidentId);
      if (this.dropdownEl) this.dropdownEl.classList.remove('open');
    } else if (notif.resourceId) {
      state.openResourceDrawer(notif.resourceId);
      if (this.dropdownEl) this.dropdownEl.classList.remove('open');
    }
  }

  showToast(notif) {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast-item ${notif.type === 'critical' ? 'critical' : ''}`;
    toast.innerHTML = `
      <span style="font-size: 18px;">${notif.type === 'critical' ? '🚨' : (notif.type === 'warning' ? '⚠️' : 'ℹ️')}</span>
      <div style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
        <div style="font-size: 12px; font-weight: 700; color: var(--text-primary);">${notif.title}</div>
        <div style="font-size: 11px; color: var(--text-secondary);">${notif.message}</div>
      </div>
      <button style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 4px;" onclick="this.parentElement.remove()">✕</button>
    `;

    if (notif.incidentId) {
      toast.style.cursor = 'pointer';
      toast.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') {
          state.openIncidentDrawer(notif.incidentId);
          toast.remove();
        }
      });
    }

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 6000);
  }
}

export const notifications = new NotificationSystem();
window.__rakshaNotif = notifications;
