import { emptyState, validateState } from './model.js';
export const STORAGE_KEY = 'receptionist.phase1.v1';
// Atomic whole-document writes; IDs and nesting provide business isolation.
// Never overwrite unreadable data or a newer write from another tab.
export class Repository {
  constructor(storage) { this.storage = storage; this.raw = null; this.state = emptyState(); this.blocked = false; }
  load() {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      const next = raw === null ? emptyState() : validateState(JSON.parse(raw));
      this.raw = raw; this.state = next; this.blocked = false;
      return structuredClone(next);
    } catch {
      this.blocked = true;
      throw new Error('Saved data could not be read. It has not been overwritten. Export a backup before clearing site data or retrying.');
    }
  }
  read() { return structuredClone(this.state); }
  update(change) {
    if (this.blocked) throw new Error('Storage is unavailable. Existing data has not been changed.');
    const next = this.read();
    change(next); validateState(next);
    const raw = JSON.stringify(next);
    try {
      if (this.storage.getItem(STORAGE_KEY) !== this.raw) throw new Error('conflict');
      this.storage.setItem(STORAGE_KEY, raw);
    } catch (error) {
      if (error.message === 'conflict') throw new Error('Another tab changed your data. Reload before saving; this edit was not saved.');
      throw new Error('Could not save to this browser. Storage may be full or disabled. Export a backup and free space, then retry.');
    }
    this.raw = raw; this.state = next;
    return this.read();
  }
  business(id, change) {
    return this.update(state => {
      const business = state.businesses.find(b => b.id === id);
      if (!business) throw new Error('Business no longer exists. Reload and try again.');
      change(business);
    });
  }
}
