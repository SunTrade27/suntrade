# ============================================
# 🎬 AI Анимация - Google Colab
# Суретті AI арқылы тірілтіңіз!
# ============================================

# 1. Орнату (әрқашан орындаңыз)
!pip install -q diffusers transformers accelerate safetensors
!pip install -q imageio imageio[ffmpeg]

# 2. Библиотекаларды жүктеу
import torch
import numpy as np
from diffusers import StableVideoDiffusionPipeline
from PIL import Image
import imageio
from IPython.display import HTML
from base64 import b64encode
import os

# 3. GPU тексеру
print("🔥 GPU қолданылуда:" if torch.cuda.is_available() else "⚠️ GPU жоқ!")
device = "cuda" if torch.cuda.is_available() else "cpu"

# 4. Модельді жүктеу (бірінші рет 1-2 минут алады)
print("⏳ Модель жүктелуде...")
pipe = StableVideoDiffusionPipeline.from_pretrained(
    "stabilityai/stable-video-diffusion-img2vid-xt",
    torch_dtype=torch.float16,
    variant="fp16"
)
pipe = pipe.to(device)
print("✅ Модель дайын!")

# ============================================
# 📤 СУРЕТТІ ЖҮКТЕҢІЗ
# ============================================

# әдіс 1: Файлды жүктеу
from google.colab import files
uploaded = files.upload()

# Жүктелген файлды алу
image_path = list(uploaded.keys())[0]
print(f"📸 Сурет жүктелді: {image_path}")

# Суретті көрсету
image = Image.open(image_path)
display(image.resize((256, 256)))

# ============================================
# 🎬 АНИМАЦИЯ ЖАСАУ
# ============================================

# Промпт - SVD промпт қабылдамайды, тек суреттен видео жасайды
# Промптты атау ретінде ғана пайдаланамыз
prompt_name = input("✍️ Анимация атын жазыңыз (мысалы: 'waving'): ")

# Параметрлер
num_frames = 25  # Кадр саны (14-25)
motion_bucket_id = 127  # Қозғалыс деңгейі (1-255)
guidance_scale = 3.5  # Кескін сапасы

print(f"🎬 Анимация жасалуда... (аты: '{prompt_name}')")

# Seed бекіту (әрқашан бірдей нәтиже үшін)
generator = torch.Generator(device=device).manual_seed(42)

# Видео генерация (SVD - тек сурет алады, промпт қабылдамайды)
with torch.no_grad():
    frames = pipe(
        image,
        num_frames=num_frames,
        motion_bucket_id=motion_bucket_id,
        guidance_scale=guidance_scale,
        generator=generator
    ).frames[0]

print("✅ Анимация дайын!")

# ============================================
# 💾 САҚТАУ ЖӘНЕ КӨРСЕТУ
# ============================================

# GIF ретінде сақтау
output_path = "animation.gif"
frames[0].save(
    output_path,
    save_all=True,
    append_images=frames[1:],
    duration=83,  # ms per frame (1000/12fps ≈ 83ms)
    loop=0
)
print(f"💾 GIF сақталды: {output_path}")

# MP4 ретінде сақтау
video_path = "animation.mp4"
imageio.mimsave(video_path, [np.array(f) for f in frames], fps=12)
print(f"💾 Video сақталды: {video_path}")

# Нәтижені көрсету
print("\n🎬 Нәтиже:")
display(HTML(f'''
<video width="512" autoplay loop muted>
  <source src="data:video/mp4;base64,{b64encode(open(video_path, 'rb').read()).decode()}" type="video/mp4">
</video>
'''))

# ============================================
# ⚙️ ПАРАМЕТРЛЕРДІ ӨЗГЕРТУ
# ============================================

# Төмендегі параметрлерді өзгертіп, әртүрлі нәтиже алыңыз:

# motion_bucket_id: 1-255
#   1 = аз қозғалыс
#   127 = орташа
#   255 = көп қозғалыс

# guidance_scale: 1-10
#   1 = промптқа аз бағынады
#   3.5 = орташа
#   10 = промптқа көп бағынады

# num_frames: 14-25
#   14 = қысқа
#   25 = ұзын

# ============================================
# 🔄 БАСҚА ПРОМПТТЫҚ МЫССАЛАР
# ============================================

example_prompts = [
    "character breathing slowly",
    "person waving hello",
    "character nodding head",
    "person smiling and laughing",
    "character looking around curiously",
    "person turning head left to right",
    "character blinking eyes",
    "person raising eyebrows",
]

print("📝 Мысал промпттар:")
for i, p in enumerate(example_prompts, 1):
    print(f"  {i}. {p}")
