// ── RESOURCES — asset loading, emits 'ready' when complete ──────────────────

export default class Resources {
  constructor(events) {
    this.events = events;
    this.items = {};
    this.toLoad = 0;
    this.loaded = 0;
  }

  /** Load a list of asset descriptors: [{ name, type, path }] */
  load(sources = []) {
    this.toLoad = sources.length;
    if (this.toLoad === 0) {
      this._onReady();
      return;
    }
    sources.forEach(src => this._loadItem(src));
  }

  _loadItem({ name, type, path }) {
    if (type === 'texture') {
      const loader = new THREE.TextureLoader();
      loader.load(path, tex => {
        this.items[name] = tex;
        this._onItemLoaded();
      });
    } else if (type === 'gltf') {
      // GLTFLoader if needed
      this._onItemLoaded();
    } else {
      this._onItemLoaded();
    }
  }

  _onItemLoaded() {
    this.loaded++;
    this.events.emit('resourceProgress', {
      loaded: this.loaded,
      total: this.toLoad,
    });
    if (this.loaded >= this.toLoad) this._onReady();
  }

  _onReady() {
    this.events.emit('ready');
  }

  get(name) {
    return this.items[name];
  }
}
