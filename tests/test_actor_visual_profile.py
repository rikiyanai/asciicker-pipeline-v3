"""Tests for ActorVisualProfile data structures."""

import json
import tempfile
from pathlib import Path

import pytest

from src.pipeline_v2.actor_visual_profile import (
    ActorVisualProfile,
    LayerAssignment,
    MountComposition,
    QualityGates,
    Region,
    SourceRefs,
    create_profile,
    load_profiles_from_directory,
)


class TestRegion:
    """Test Region dataclass."""

    def test_region_creation(self):
        region = Region(x=0, y=0, w=8, h=8)
        assert region.x == 0
        assert region.y == 0
        assert region.w == 8
        assert region.h == 8

    def test_region_to_dict(self):
        region = Region(x=5, y=10, w=16, h=24)
        assert region.to_dict() == {"x": 5, "y": 10, "w": 16, "h": 24}

    def test_region_from_dict(self):
        data = {"x": 5, "y": 10, "w": 16, "h": 24}
        region = Region.from_dict(data)
        assert region.x == 5
        assert region.y == 10
        assert region.w == 16
        assert region.h == 24


class TestLayerAssignment:
    """Test LayerAssignment dataclass."""

    def test_minimal_layer(self):
        layer = LayerAssignment(
            slot="body",
            layer_definition_id=700,
            xp_ref="assets/sprites/player.xp",
        )
        assert layer.slot == "body"
        assert layer.layer_definition_id == 700
        assert layer.xp_ref == "assets/sprites/player.xp"
        assert layer.visual_style_id is None
        assert layer.item_definition_id is None
        assert layer.region is None

    def test_full_layer(self):
        layer = LayerAssignment(
            slot="weapon",
            layer_definition_id=750,
            xp_ref="assets/sprites/weapons.xp",
            visual_style_id=2,
            item_definition_id=2001,
            region=Region(x=8, y=0, w=8, h=8),
        )
        assert layer.slot == "weapon"
        assert layer.visual_style_id == 2
        assert layer.item_definition_id == 2001
        assert layer.region is not None
        assert layer.region.x == 8

    def test_layer_to_dict(self):
        layer = LayerAssignment(
            slot="head",
            layer_definition_id=710,
            xp_ref="helmets.xp",
            visual_style_id=1,
            region=Region(x=0, y=8, w=8, h=8),
        )
        d = layer.to_dict()
        assert d["slot"] == "head"
        assert d["layer_definition_id"] == 710
        assert d["xp_ref"] == "helmets.xp"
        assert d["visual_style_id"] == 1
        assert d["region"]["x"] == 0

    def test_layer_from_dict(self):
        data = {
            "slot": "chest",
            "layer_definition_id": 720,
            "xp_ref": "armor.xp",
            "visual_style_id": 3,
            "item_definition_id": 3001,
            "region": {"x": 16, "y": 0, "w": 8, "h": 8},
        }
        layer = LayerAssignment.from_dict(data)
        assert layer.slot == "chest"
        assert layer.visual_style_id == 3
        assert layer.item_definition_id == 3001
        assert layer.region is not None
        assert layer.region.w == 8


class TestMountComposition:
    """Test MountComposition dataclass."""

    def test_minimal_mount(self):
        mount = MountComposition(
            mount_definition_id=300,
            rear_layer_index=0,
            rider_layer_index=1,
        )
        assert mount.mount_definition_id == 300
        assert mount.rear_layer_index == 0
        assert mount.rider_layer_index == 1
        assert mount.front_layer_index is None

    def test_full_mount(self):
        mount = MountComposition(
            mount_definition_id=300,
            rear_layer_index=0,
            rider_layer_index=1,
            front_layer_index=2,
        )
        assert mount.front_layer_index == 2

    def test_mount_to_dict(self):
        mount = MountComposition(
            mount_definition_id=300,
            rear_layer_index=0,
            rider_layer_index=1,
            front_layer_index=2,
        )
        d = mount.to_dict()
        assert d["mount_definition_id"] == 300
        assert d["rear_layer_index"] == 0
        assert d["front_layer_index"] == 2


class TestSourceRefs:
    """Test SourceRefs dataclass."""

    def test_minimal_refs(self):
        refs = SourceRefs()
        assert refs.xp_file is None
        assert refs.png_file is None
        assert refs.semantic_map is None
        assert refs.calibration_artifact is None

    def test_full_refs(self):
        refs = SourceRefs(
            xp_file="assets/sprites/player.xp",
            png_file="assets/sprites/player.png",
            semantic_map="human_idle.json",
            calibration_artifact="output/mounted/calibration.json",
        )
        assert refs.xp_file == "assets/sprites/player.xp"
        assert refs.calibration_artifact == "output/mounted/calibration.json"


class TestQualityGates:
    """Test QualityGates dataclass."""

    def test_empty_gates(self):
        gates = QualityGates()
        assert gates.G7_cell_density is None
        assert gates.timestamp is None

    def test_passing_gates(self):
        gates = QualityGates(
            G7_cell_density=True,
            G8_glyph_coverage=True,
            G9_semantic_completeness=True,
            mounted_alignment=True,
            timestamp="2026-05-12T00:00:00Z",
        )
        assert gates.G7_cell_density is True
        assert gates.mounted_alignment is True


class TestActorVisualProfile:
    """Test ActorVisualProfile dataclass."""

    def test_minimal_profile(self):
        profile = ActorVisualProfile(
            profile_id="human_idle_default",
            skin_definition_id=100,
            presentation_kind="idle_walk",
            domain="skin",
            layers=[
                LayerAssignment(
                    slot="body",
                    layer_definition_id=700,
                    xp_ref="player.xp",
                )
            ],
        )
        assert profile.profile_id == "human_idle_default"
        assert profile.skin_definition_id == 100
        assert profile.presentation_kind == "idle_walk"
        assert profile.domain == "skin"
        assert len(profile.layers) == 1
        assert profile.schema_version == 1
        assert profile.variation is None

    def test_profile_with_variation(self):
        profile = ActorVisualProfile(
            profile_id="human_attack_crossbow",
            skin_definition_id=100,
            presentation_kind="attack",
            domain="skin",
            layers=[
                LayerAssignment(slot="body", layer_definition_id=701, xp_ref="player.xp"),
                LayerAssignment(
                    slot="weapon",
                    layer_definition_id=750,
                    xp_ref="weapons.xp",
                    item_definition_id=2001,
                ),
            ],
            variation="crossbow_attack",
        )
        assert profile.variation == "crossbow_attack"
        assert len(profile.layers) == 2

    def test_mounted_profile(self):
        profile = ActorVisualProfile(
            profile_id="wolf_mounted_idle",
            skin_definition_id=100,
            presentation_kind="idle_walk",
            domain="mount",
            layers=[
                LayerAssignment(slot="mount_rear", layer_definition_id=760, xp_ref="mounted.xp"),
                LayerAssignment(slot="mount_rider", layer_definition_id=761, xp_ref="mounted.xp"),
                LayerAssignment(slot="mount_front", layer_definition_id=762, xp_ref="mounted.xp"),
            ],
            mount_composition=MountComposition(
                mount_definition_id=300,
                rear_layer_index=0,
                rider_layer_index=1,
                front_layer_index=2,
            ),
        )
        assert profile.domain == "mount"
        assert profile.mount_composition is not None
        assert profile.mount_composition.mount_definition_id == 300

    def test_profile_validation_invalid_id(self):
        with pytest.raises(ValueError, match="profile_id must start with a letter"):
            ActorVisualProfile(
                profile_id="123_invalid",
                skin_definition_id=100,
                presentation_kind="idle_walk",
                domain="skin",
                layers=[LayerAssignment(slot="body", layer_definition_id=700, xp_ref="x.xp")],
            )

    def test_profile_validation_no_layers(self):
        with pytest.raises(ValueError, match="At least one layer is required"):
            ActorVisualProfile(
                profile_id="empty_profile",
                skin_definition_id=100,
                presentation_kind="idle_walk",
                domain="skin",
                layers=[],
            )

    def test_profile_to_dict(self):
        profile = ActorVisualProfile(
            profile_id="test_profile",
            skin_definition_id=100,
            presentation_kind="idle_walk",
            domain="skin",
            layers=[
                LayerAssignment(
                    slot="body",
                    layer_definition_id=700,
                    xp_ref="player.xp",
                    region=Region(x=0, y=0, w=8, h=8),
                )
            ],
            variation="default",
        )
        d = profile.to_dict()
        assert d["schema_version"] == 1
        assert d["profile_id"] == "test_profile"
        assert d["variation"] == "default"
        assert len(d["layers"]) == 1
        assert d["layers"][0]["region"]["x"] == 0

    def test_profile_to_json_and_back(self):
        profile = ActorVisualProfile(
            profile_id="roundtrip_test",
            skin_definition_id=100,
            presentation_kind="attack",
            domain="skin",
            layers=[
                LayerAssignment(slot="body", layer_definition_id=701, xp_ref="player.xp")
            ],
            variation="default",
        )
        json_str = profile.to_json()
        restored = ActorVisualProfile.from_json(json_str)
        assert restored.profile_id == profile.profile_id
        assert restored.skin_definition_id == profile.skin_definition_id
        assert restored.presentation_kind == profile.presentation_kind
        assert restored.variation == profile.variation

    def test_profile_file_io(self):
        profile = ActorVisualProfile(
            profile_id="file_test",
            skin_definition_id=100,
            presentation_kind="idle_walk",
            domain="skin",
            layers=[LayerAssignment(slot="body", layer_definition_id=700, xp_ref="x.xp")],
        )
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "test_profile.json"
            profile.to_file(path)
            assert path.exists()
            loaded = ActorVisualProfile.from_file(path)
            assert loaded.profile_id == "file_test"

    def test_get_server_visual_key_basic(self):
        profile = ActorVisualProfile(
            profile_id="human_idle_default",
            skin_definition_id=100,
            presentation_kind="idle_walk",
            domain="skin",
            layers=[LayerAssignment(slot="body", layer_definition_id=700, xp_ref="x.xp")],
            variation="default",
        )
        key = profile.get_server_visual_key()
        assert key["skin_definition_id"] == 100
        assert key["presentation_kind_id"] == "idle_walk"
        assert key["variation"] == "default"
        assert key["domain"] == "skin"
        assert "slot_state" in key
        assert "mount_state" in key

    def test_get_server_visual_key_mounted(self):
        profile = ActorVisualProfile(
            profile_id="wolf_mounted_idle",
            skin_definition_id=100,
            presentation_kind="idle_walk",
            domain="mount",
            layers=[
                LayerAssignment(slot="mount_rear", layer_definition_id=760, xp_ref="m.xp"),
                LayerAssignment(slot="mount_rider", layer_definition_id=761, xp_ref="m.xp"),
            ],
            mount_composition=MountComposition(
                mount_definition_id=300,
                rear_layer_index=0,
                rider_layer_index=1,
            ),
        )
        key = profile.get_server_visual_key()
        assert key["mount_state"]["is_mounted"] is True
        assert key["mount_state"]["mount_definition_id"] == 300

    def test_get_slot_state(self):
        profile = ActorVisualProfile(
            profile_id="armed_human",
            skin_definition_id=100,
            presentation_kind="attack",
            domain="skin",
            layers=[
                LayerAssignment(slot="body", layer_definition_id=701, xp_ref="p.xp"),
                LayerAssignment(
                    slot="weapon",
                    layer_definition_id=750,
                    xp_ref="w.xp",
                    item_definition_id=2001,
                ),
                LayerAssignment(
                    slot="head",
                    layer_definition_id=710,
                    xp_ref="h.xp",
                    item_definition_id=3001,
                ),
            ],
        )
        slot_state = profile._get_slot_state()
        assert slot_state["body"] == 701
        assert slot_state["weapon"] == 2001
        assert slot_state["head"] == 3001
        assert slot_state["shield"] is None


class TestCreateProfile:
    """Test create_profile factory function."""

    def test_create_simple_profile(self):
        profile = create_profile(
            profile_id="test_profile",
            skin_definition_id=100,
            presentation_kind="idle_walk",
            domain="skin",
            layers=[LayerAssignment(slot="body", layer_definition_id=700, xp_ref="x.xp")],
            variation="default",
        )
        assert isinstance(profile, ActorVisualProfile)
        assert profile.profile_id == "test_profile"
        assert profile.variation == "default"


class TestLoadProfilesFromDirectory:
    """Test load_profiles_from_directory function."""

    def test_load_from_empty_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            profiles = load_profiles_from_directory(tmpdir)
            assert len(profiles) == 0

    def test_load_from_directory_with_profiles(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a valid profile
            profile = ActorVisualProfile(
                profile_id="test1",
                skin_definition_id=100,
                presentation_kind="idle_walk",
                domain="skin",
                layers=[LayerAssignment(slot="body", layer_definition_id=700, xp_ref="x.xp")],
            )
            path = Path(tmpdir) / "test1.json"
            profile.to_file(path)
            
            # Create an invalid file (should be skipped)
            invalid_path = Path(tmpdir) / "_schema.json"
            invalid_path.write_text("{}", encoding="utf-8")
            
            profiles = load_profiles_from_directory(tmpdir)
            assert len(profiles) == 1
            assert profiles[0].profile_id == "test1"

    def test_load_skips_invalid_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create an invalid JSON file
            path = Path(tmpdir) / "invalid.json"
            path.write_text("not valid json", encoding="utf-8")
            
            profiles = load_profiles_from_directory(tmpdir)
            assert len(profiles) == 0  # Should skip invalid file


class TestIntegration:
    """Integration tests for complete workflows."""

    def test_full_profile_roundtrip(self):
        """Test creating a complex profile, serializing, and deserializing."""
        original = ActorVisualProfile(
            profile_id="complex_mounted_profile",
            skin_definition_id=100,
            presentation_kind="attack",
            domain="mount",
            layers=[
                LayerAssignment(
                    slot="mount_rear",
                    layer_definition_id=760,
                    xp_ref="mounted.xp",
                    region=Region(x=0, y=0, w=16, h=8),
                ),
                LayerAssignment(
                    slot="mount_rider",
                    layer_definition_id=761,
                    xp_ref="mounted.xp",
                    region=Region(x=16, y=0, w=8, h=8),
                ),
                LayerAssignment(
                    slot="mount_front",
                    layer_definition_id=762,
                    xp_ref="mounted.xp",
                    item_definition_id=2001,
                    visual_style_id=1,
                    region=Region(x=24, y=0, w=8, h=8),
                ),
            ],
            variation="default",
            mount_composition=MountComposition(
                mount_definition_id=300,
                rear_layer_index=0,
                rider_layer_index=1,
                front_layer_index=2,
            ),
            source_refs=SourceRefs(
                xp_file="assets/sprites/mounted.xp",
                calibration_artifact="output/mounted/calibration.json",
            ),
            quality_gates=QualityGates(
                G7_cell_density=True,
                G8_glyph_coverage=True,
                G9_semantic_completeness=True,
                mounted_alignment=True,
                timestamp="2026-05-12T00:00:00Z",
            ),
            metadata={"author": "test", "notes": "Integration test profile"},
        )
        
        # Serialize
        json_str = original.to_json()
        
        # Deserialize
        restored = ActorVisualProfile.from_json(json_str)
        
        # Verify all fields
        assert restored.profile_id == original.profile_id
        assert restored.skin_definition_id == original.skin_definition_id
        assert restored.presentation_kind == original.presentation_kind
        assert restored.domain == original.domain
        assert len(restored.layers) == len(original.layers)
        assert restored.variation == original.variation
        assert restored.mount_composition is not None
        assert restored.mount_composition.mount_definition_id == 300
        assert restored.source_refs is not None
        assert restored.source_refs.calibration_artifact == "output/mounted/calibration.json"
        assert restored.quality_gates is not None
        assert restored.quality_gates.G7_cell_density is True
        assert restored.metadata is not None
        assert restored.metadata["author"] == "test"

    def test_server_visual_key_generation(self):
        """Test that ServerVisualKey generation produces expected structure."""
        profile = ActorVisualProfile(
            profile_id="armed_mounted_human",
            skin_definition_id=100,
            presentation_kind="attack",
            domain="mount",
            layers=[
                LayerAssignment(slot="mount_rear", layer_definition_id=760, xp_ref="m.xp"),
                LayerAssignment(slot="mount_rider", layer_definition_id=761, xp_ref="m.xp"),
                LayerAssignment(slot="body", layer_definition_id=701, xp_ref="p.xp"),
                LayerAssignment(
                    slot="weapon",
                    layer_definition_id=750,
                    xp_ref="w.xp",
                    item_definition_id=2001,
                ),
            ],
            variation="crossbow_attack",
            mount_composition=MountComposition(
                mount_definition_id=300,
                rear_layer_index=0,
                rider_layer_index=1,
            ),
        )
        
        key = profile.get_server_visual_key()
        
        # Verify key structure
        assert key["skin_definition_id"] == 100
        assert key["presentation_kind_id"] == "attack"
        assert key["variation"] == "crossbow_attack"
        assert key["domain"] == "mount"
        
        # Verify slot state captures weapon
        assert key["slot_state"]["weapon"] == 2001
        assert key["slot_state"]["body"] == 701
        
        # Verify mount state
        assert key["mount_state"]["is_mounted"] is True
        assert key["mount_state"]["mount_definition_id"] == 300
        assert key["mount_state"]["has_rear"] is True
        assert key["mount_state"]["has_rider"] is True
