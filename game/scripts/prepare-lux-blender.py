"""Reduce the repeated residential module with Blender's local glTF importer."""

import sys

import bpy


source, destination = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source, merge_vertices=True)
housing, = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
bpy.context.view_layer.objects.active = housing
reduction = housing.modifiers.new("Courtyard facade", "DECIMATE")
reduction.ratio = 0.43
reduction.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=reduction.name)
bpy.ops.export_scene.gltf(
    filepath=destination, export_format="GLB", export_animations=False,
    export_cameras=False, export_lights=False, export_normals=True,
)
