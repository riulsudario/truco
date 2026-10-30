"""Build ComfyUI API graphs for sprites and seamless tiles.

The graph is plain data, so the exact graph used for every candidate is stored
in its metadata and can be queued again to reproduce the image.
"""
from __future__ import annotations

WORKFLOW_VERSION = "sprite-v1"


def build_graph(*, style: dict, asset: dict, seed: int, width: int, height: int,
                reference_image: str | list[str] | None) -> dict:
    """Return an API-format graph. reference_image names file(s) inside ComfyUI's input dir;
    several images are batched and their embeddings concatenated by the IP-Adapter."""
    gen = style["generation"]
    tile = asset["kind"] == "tile"
    g: dict[str, dict] = {}

    def node(node_id: str, class_type: str, **inputs) -> list:
        g[node_id] = {"class_type": class_type, "inputs": inputs}
        return [node_id, 0]

    ckpt = node("1", "CheckpointLoaderSimple", ckpt_name=gen["checkpoint"])
    model, clip = ckpt, [ckpt[0], 1]
    vae = node("2", "VAELoader", vae_name=gen["vae"])
    for i, lora in enumerate(gen["loras"]):
        lora_node = f"3{i}"
        node(lora_node, "LoraLoader", model=model, clip=clip, lora_name=lora["name"],
             strength_model=lora["strength"], strength_clip=lora["strength"])
        model, clip = [lora_node, 0], [lora_node, 1]

    # The tiling node patches conv layers of the shared model in place, so sprite
    # graphs reset it explicitly; otherwise results would depend on run order.
    model = node("4", "SeamlessTile", model=model, tiling="enable" if tile else "disable",
                 copy_model="Make a copy")

    ip = style.get("ip_adapter")
    refs = [reference_image] if isinstance(reference_image, str) else list(reference_image or [])
    if ip and refs:
        ref = node("500", "LoadImage", image=refs[0])
        for i, name in enumerate(refs[1:], start=1):
            loaded = node(f"50{i}", "LoadImage", image=name)
            ref = node(f"51{i}", "ImageBatch", image1=ref, image2=loaded)
        node("54", "IPAdapterModelLoader", ipadapter_file=ip["model"])
        node("52", "CLIPVisionLoader", clip_name=ip["clip_vision"])
        weight = asset.get("generation", {}).get("ip_weight", ip["weight"])
        model = node("53", "IPAdapterAdvanced", model=model, ipadapter=["54", 0], image=ref,
                     weight=weight, weight_type=ip["weight_type"], combine_embeds="concat",
                     start_at=ip.get("start_at", 0.0), end_at=ip.get("end_at", 1.0),
                     embeds_scaling=ip.get("embeds_scaling", "V only"), clip_vision=["52", 0])

    transparent = asset.get("transparent", False) and not tile
    if transparent:
        model = node("6", "LayeredDiffusionApply", model=model,
                     config="SDXL, Attention Injection", weight=1.0)

    positive = node("7", "CLIPTextEncode", clip=clip, text=compose_prompt(style, asset))
    negative = node("8", "CLIPTextEncode", clip=clip, text=compose_negative(style, asset))
    latent = node("9", "EmptyLatentImage", width=width, height=height, batch_size=1)
    samples = node("10", "KSampler", model=model, positive=positive, negative=negative,
                   latent_image=latent, seed=seed, steps=gen["steps"], cfg=gen["cfg"],
                   sampler_name=gen["sampler"], scheduler=gen["scheduler"], denoise=1.0)

    if tile:
        image = node("11", "CircularVAEDecode", samples=samples, vae=vae, tiling="enable")
    else:
        image = node("11", "VAEDecode", samples=samples, vae=vae)
    if transparent:
        image = node("12", "LayeredDiffusionDecodeRGBA", samples=samples, images=image,
                     sd_version="SDXL", sub_batch_size=16)
    node("13", "SaveImage", images=image, filename_prefix=f"assetgen/{asset['id']}")
    return g


def compose_prompt(style: dict, asset: dict) -> str:
    kind = "tile" if asset["kind"] == "tile" else "sprite"
    parts = [style["prompt"]["prefix"], style["prompt"].get(f"{kind}_prefix", ""),
             " ".join(asset["prompt"].split()), style["prompt"]["suffix"],
             style["prompt"].get(f"{kind}_suffix", "")]
    return ", ".join(p.strip().strip(",") for p in parts if p and p.strip())


def compose_negative(style: dict, asset: dict) -> str:
    kind = "tile" if asset["kind"] == "tile" else "sprite"
    parts = [style["prompt"]["negative"], style["prompt"].get(f"{kind}_negative", ""),
             asset.get("negative", "")]
    return ", ".join(p.strip().strip(",") for p in parts if p and p.strip())
