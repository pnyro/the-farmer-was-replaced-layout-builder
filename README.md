# The Farmer Was Replaced - Draw Tool

## Screenshots

![App Screenshot](./public/screenshot.png)

1. Intro
2. Setup
3. Other

## Scripts for testing

Use these scripts to be able to drop-in the grid config.

```python
# mod_globals

def index_to_coords(index):
	grid_size = get_world_size()
	x = index % grid_size
	y = index // grid_size
	return (x, y)

def coords_to_index(x, y):
	grid_size = get_world_size() ** 2
	return y * grid_size + x
```

```python
# mod_farm

def do_plant(crop_type):
	soil_types = [Entities.Bush, Entities.Carrot, Entities.Pumpkin]
	ground_type = get_ground_type()

	if can_harvest():
		harvest()

	if crop_type in soil_types:
		if not ground_type == Grounds.Soil:
			till()
	else:
		if not ground_type == Grounds.Grassland:
			till()

	if get_water() < 0.7:
		use_item(Items.Water)

	plant(crop_type)

def do_farm(grid):
	if not grid or len(grid) == 0:
		return False

	world_size = get_world_size() ** 2

	index = 0
	for block in grid:
		mod_move.move_to_index(index)

		if can_harvest():
			harvest()

		if get_ground_type() != block['ground']:
			till()

		if get_entity_type() != block['entity']:
			do_plant(block['entity'])

		index = index + 1

	if index == world_size:
		return True

	return False
```

```python
# mod_move

def move_to_pos(target_x, target_y):
	cur_x = get_pos_x()
	cur_y = get_pos_y()
	grid_size = get_world_size()

	diff_x = target_x - cur_x
	if diff_x == 0:
		moves_x = 0
		dir_x = None
	else:
		abs_diff_x = diff_x
		if abs_diff_x < 0:
			abs_diff_x = abs_diff_x * -1

		wrap_x = grid_size - abs_diff_x

		if abs_diff_x <= grid_size // 2:
			moves_x = abs_diff_x
			if diff_x > 0:
				dir_x = East
			else:
				dir_x = West
		else:
			moves_x = wrap_x
			if diff_x > 0:
				dir_x = West
			else:
				dir_x = East

	diff_y = target_y - cur_y
	if diff_y == 0:
		moves_y = 0
		dir_y = None
	else:
		abs_diff_y = diff_y
		if abs_diff_y < 0:
			abs_diff_y = abs_diff_y * -1

		wrap_y = grid_size - abs_diff_y

		if abs_diff_y <= grid_size // 2:
			moves_y = abs_diff_y
			if diff_y > 0:
				dir_y = North
			else:
				dir_y = South
		else:
			moves_y = wrap_y
			if diff_y > 0:
				dir_y = South
			else:
				dir_y = North

	# === Already There ===
	if moves_x == 0 and moves_y == 0:
		do_a_flip()

	if moves_x > 0:
		count = 0
		while count < moves_x:
			move(dir_x)
			count = count + 1

	if moves_y > 0:
		count = 0
		while count < moves_y:
			move(dir_y)
			count = count + 1

	return True

def move_to_index(index):
	x, y = mod_globals.index_to_coords(index)
	move_to_pos(x, y)
	return True
```

Then call it like this:

```python
import mod_farm

# define the grid here or import from another module
grid = [
  {
	"ground": Grounds.Soil,
	"entity": Entities.Carrot
  },
  {
	"ground": Grounds.Grassland,
	"entity": Entities.Grass
  }
]

# pass the grid definition to do_farm
mod_farm.do_farm(grid) # farms once
```
