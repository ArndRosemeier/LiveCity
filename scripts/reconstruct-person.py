"""Offline original-reference reconstruction experiment. Never runs in the browser.

Uses the official MIT-licensed TripoSR checkout in .tools/TripoSR. CPU marching
cubes replaces the CUDA extension only for mesh extraction; neural inference
still uses the GPU. All downloaded weights and experiment output stay ignored.
"""
import os
from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parents[1]
os.environ['HF_HOME'] = str(ROOT / '.cache/huggingface')
os.environ['U2NET_HOME'] = str(ROOT / '.cache/rembg')
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
sys.path.insert(0, str(ROOT / '.tools/TripoSR'))

import torch
import numpy as np
from skimage.measure import marching_cubes

def cpu_mc(level, threshold):
    vertices, faces, _, _ = marching_cubes(level.cpu().numpy(), threshold)
    # torchmcubes returns coordinates in z,y,x order. TripoSR reverses these.
    return torch.from_numpy(vertices[:, ::-1].copy()), torch.from_numpy(faces.copy())

shim = types.ModuleType('torchmcubes')
shim.marching_cubes = cpu_mc
sys.modules['torchmcubes'] = shim

from PIL import Image
import rembg
from tsr.system import TSR
from tsr.utils import remove_background, resize_foreground

print('GPU:', torch.cuda.get_device_name(), flush=True)
print('Loading official TripoSR model', flush=True)
model = TSR.from_pretrained('stabilityai/TripoSR', 'config.yaml', 'model.ckpt')
model.renderer.set_chunk_size(4096)
model.to('cuda')
print('Preparing original reference', flush=True)
image = remove_background(Image.open(ROOT / 'docs/people-reference.png'), rembg.new_session('u2net'))
image = resize_foreground(image, .85)
input_array = np.array(image).astype(np.float32) / 255
input_array = input_array[:, :, :3] * input_array[:, :, 3:4] + (1-input_array[:, :, 3:4])*.5
print('Reconstructing', flush=True)
with torch.no_grad():
    codes = model([input_array], device='cuda')
    meshes = model.extract_mesh(codes, True, resolution=256)
output = ROOT / '.tools/person-experiment'
output.mkdir(exist_ok=True)
meshes[0].export(output / 'original-head.glb')
print('Exported', output / 'original-head.glb', 'bounds:', meshes[0].bounds, flush=True)
