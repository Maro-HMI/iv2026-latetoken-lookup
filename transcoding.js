const sdkUrl = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js';
const coreUrl = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
const workerUrl = new URL('./transcoding-worker.js', import.meta.url);

const setup = document.querySelector('#setup');
const initialize = document.querySelector('#initialize');
const form = document.querySelector('#transcode');
const input = document.querySelector('#video-file');
const convert = document.querySelector('#convert');
const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const download = document.querySelector('#download');

let encoder;
let downloadUrl;

function showStatus(message, isError = false) {
  status.textContent = message;
  status.toggleAttribute('data-error', isError);
}

function clearDownload() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = undefined;
  download.removeAttribute('href');
  download.hidden = true;
}

initialize.addEventListener('click', async () => {
  initialize.disabled = true;
  showStatus('Loading the encoder…');
  try {
    const { FFmpeg } = await import(sdkUrl);
    encoder = new FFmpeg();
    await encoder.load({
      classWorkerURL: workerUrl.href,
      coreURL: `${coreUrl}/ffmpeg-core.js`,
      wasmURL: `${coreUrl}/ffmpeg-core.wasm`
    }, { signal: AbortSignal.timeout(120000) });
    encoder.on('progress', ({ progress: ratio }) => {
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      const percent = Math.floor(ratio * 100);
      progress.value = Math.max(progress.value, Math.min(percent, 99));
    });
    setup.hidden = true;
    form.hidden = false;
    showStatus('Encoder ready.');
    input.focus();
  } catch (error) {
    encoder?.terminate();
    encoder = undefined;
    console.error('Encoder initialization failed', error);
    initialize.disabled = false;
    showStatus('Could not load the encoder. Check your connection and try again.', true);
  }
});

input.addEventListener('change', () => {
  clearDownload();
  convert.disabled = !input.files.length;
  showStatus('');
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const file = input.files[0];
  if (!encoder?.loaded || !file || convert.disabled) return;
  const inputPath = 'input-video';
  const outputPath = 'converted.mp4';
  clearDownload();
  input.disabled = true;
  convert.disabled = true;
  progress.removeAttribute('value');
  progress.hidden = false;
  showStatus('Converting to MP4… Keep this tab open.');
  try {
    await encoder.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));
    const exitCode = await encoder.exec([
      '-i', inputPath, '-map', '0:V:0', '-map', '0:a:0?',
      '-vf', 'scale=ceil(iw/2)*2:ceil(ih/2)*2',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outputPath
    ]);
    if (exitCode !== 0) throw new Error(`FFmpeg exited with code ${exitCode}`);
    const output = await encoder.readFile(outputPath);
    const blob = new Blob([output], { type: 'video/mp4' });
    if (blob.size === 0) throw new Error('Empty output file');
    downloadUrl = URL.createObjectURL(blob);
    download.href = downloadUrl;
    download.download = `${file.name.replace(/\.[^.]+$/, '') || 'converted'}.mp4`;
    download.hidden = false;
    showStatus(`MP4 ready · ${(blob.size / 1048576).toFixed(1)} MB`);
  } catch (error) {
    console.error('Video conversion failed', error);
    showStatus('Could not convert this file. Check that the original video plays, then try again.', true);
  } finally {
    await Promise.allSettled([encoder.deleteFile(inputPath), encoder.deleteFile(outputPath)]);
    progress.hidden = true;
    input.disabled = false;
    convert.disabled = false;
  }
});
