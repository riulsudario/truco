import pytest
import yaml

from assetgen.config import ConfigError, validate_catalog


def test_validation_catalog_has_the_six_phase1_assets(project):
    assets = project.catalog("validation")
    assert [a["id"] for a in assets] == ["wooden_truco_table", "wooden_chair", "tropical_plant",
                                         "terracotta_floor", "character_male", "character_female"]
    floor = next(a for a in assets if a["id"] == "terracotta_floor")
    assert floor["kind"] == "tile" and floor["transparent"] is False and floor["anchor"] == "top_left"
    assert all(a["style"] == "world_topdown" for a in assets)


def test_styles_load_and_keep_perspectives_apart(project):
    assert project.style_ids() == ["table_perspective", "world_topdown"]
    world, table = project.style("world_topdown"), project.style("table_perspective")
    assert world["reference"] != table["reference"]
    assert world["generation"]["seed_salt"] != table["generation"]["seed_salt"]


def base_asset(**over):
    asset = {"id": "a_thing", "name": "A", "category": "furniture", "style": "world_topdown", "kind": "sprite",
             "description": "d", "prompt": "p", "target_size": {"width": 16, "height": 16}}
    return asset | over


@pytest.mark.parametrize("asset, message", [
    (base_asset(id="Bad-Id"), "snake_case"),
    (base_asset(style="nope"), "unknown style"),
    (base_asset(category="weapons"), "unknown category"),
    (base_asset(kind="tile", transparent=True), "tiles cannot be transparent"),
    (base_asset(target_size={"width": 0, "height": 4}), "target_size"),
    (base_asset(generation={"candidates": 50}), "candidates"),
])
def test_invalid_assets_are_rejected(asset, message):
    with pytest.raises(ConfigError, match=message):
        validate_catalog({"assets": [asset]}, "t", {"world_topdown"})


def test_duplicate_ids_are_rejected():
    with pytest.raises(ConfigError, match="duplicate"):
        validate_catalog({"assets": [base_asset(), base_asset()]}, "t", {"world_topdown"})


def test_defaults_are_filled():
    (asset,) = validate_catalog({"assets": [base_asset()]}, "t", {"world_topdown"})
    assert asset["generation"] == {"candidates": 3, "max_retries": 3}
    assert asset["anchor"] == "bottom_center" and asset["transparent"] is True and asset["catalog"] == "t"


def test_broken_style_file_is_reported(project):
    path = project.style_path("world_topdown")
    data = yaml.safe_load(path.read_text())
    del data["generation"]["seed_salt"]
    path.write_text(yaml.safe_dump(data))
    with pytest.raises(ConfigError, match="seed_salt"):
        project.style("world_topdown")
