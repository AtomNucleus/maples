import { pipeline, env } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/SmolLM2-135M-Instruct-ONNX';
let generator = null;
let backend = 'uninitialized';
let dtype = 'q4f16';

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

function generatedText(result) {
  const value = result?.[0]?.generated_text;
  if (Array.isArray(value)) return value.at(-1)?.content ?? '';
  return typeof value === 'string' ? value : '';
}

async function initialize(preferWebGPU = true) {
  if (generator) return { backend, dtype };

  const canWebGPU = Boolean(preferWebGPU && self.navigator?.gpu);
  backend = canWebGPU ? 'webgpu' : 'wasm';
  dtype = canWebGPU ? 'q4f16' : 'q4';

  env.allowLocalModels = false;
  env.useBrowserCache = true;
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(2, self.navigator?.hardwareConcurrency || 2));
  }

  generator = await pipeline('text-generation', MODEL_ID, {
    device: backend,
    dtype,
    progress_callback: info => {
      if (!info) return;
      post('progress', {
        status: info.status ?? 'loading',
        file: info.file ?? '',
        loaded: Number(info.loaded || 0),
        total: Number(info.total || 0),
        progress: Number.isFinite(info.progress) ? info.progress : null
      });
    }
  });

  return { backend, dtype };
}

self.onmessage = async event => {
  const message = event.data || {};

  if (message.type === 'init') {
    try {
      const ready = await initialize(message.preferWebGPU !== false);
      post('ready', { model: MODEL_ID, ...ready });
    } catch (error) {
      generator = null;
      post('error', { stage: 'init', message: error?.message || String(error) });
    }
    return;
  }

  if (message.type !== 'decide') return;

  try {
    await initialize(message.preferWebGPU !== false);
    const messages = [
      {
        role: 'system',
        content: 'You are a constrained game director. Follow the user instructions exactly and output JSON only.'
      },
      { role: 'user', content: message.prompt }
    ];

    const result = await generator(messages, {
      max_new_tokens: 64,
      do_sample: false,
      repetition_penalty: 1.08,
      return_full_text: false
    });

    post('decision', {
      requestId: message.requestId,
      text: generatedText(result),
      backend,
      dtype
    });
  } catch (error) {
    post('error', {
      stage: 'decision',
      requestId: message.requestId,
      message: error?.message || String(error)
    });
  }
};
