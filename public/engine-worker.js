let engine;
let pending = 0;
const boot = async () => {
  const startedAt = performance.now();
  const loading = (text, progress) => postMessage({type:'loading', text, progress, elapsedMs:performance.now() - startedAt});
  loading('Waking up the arcade…', 12);
  const archive = fetch('./engine.zip').then(response => response.arrayBuffer());
  const adapter = fetch('./bridge.py').then(response => response.text());
  importScripts('./runtime/pyodide.js');
  engine = await loadPyodide({indexURL: new URL('./runtime/', self.location).href, packages:['numpy','pydantic']});
  loading('Unpacking the puzzles…', 45);
  engine.unpackArchive(await archive,'zip',{extractDir:'/app'});
  engine.runPython("import sys; sys.path.insert(0, '/app')");
  loading('Almost ready to play…', 88);
  await engine.runPythonAsync(await adapter);
  postMessage({type:'ready', elapsedMs:performance.now() - startedAt});
  prewarm();
};
// Importing a game module costs far more than playing it, so once the adapter is ready we
// spend idle time importing them all, one per macrotask, yielding to any pending request.
const prewarm = () => {
  const games = JSON.parse(engine.runPython(
    "import json; json.dumps([entry['id'] for entry in json.load(open('/app/manifest.json'))])"));
  let done = 0;
  const step = () => {
    if (done >= games.length) return;
    if (pending) {setTimeout(step, 0); return;}
    try {engine.runPython('import importlib; importlib.import_module("games.' + games[done] + '")');} catch(error) {}
    postMessage({type:'warm', done:++done, total:games.length});
    setTimeout(step, 0);
  };
  setTimeout(step, 200);
};
let ready = boot().catch(error => {postMessage({type:'error',error:String(error)}); throw error;});
self.onmessage = async ({data}) => {
  pending++;
  try {
    await ready;
    engine.globals.set('payload', JSON.stringify(data));
    const result = JSON.parse(engine.runPython('dispatch(payload)'));
    postMessage({type:'result', requestId:data.requestId, result});
  } catch(error) {postMessage({type:'error', requestId:data.requestId, error:String(error)});}
  finally {pending--;}
};
