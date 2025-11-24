include <BOSL2/std.scad>

//visualization options
show_leds = false;
show_halos = false;
show_board = true;

$fn=16;

PHI = (1 + sqrt(5)) / 2; // =~ 1.618

branch_thickness = 10;
// shrinking overall diameter to account for diamond shapes added at tips
base_diameter = 150;
diameter = base_diameter - (branch_thickness * 1.2 * sqrt(2) * 1.5);
radius = diameter / 2;
secondary_branch_1_offset = radius*0.65;
secondary_branch_1_length = radius/3;

chamfer = branch_thickness / 3;
middle_diameter = 34;

// --- LED + halo params ---
led_size       = [5,5];
led_color      = "lightblue";
halo_color     = "lightyellow";   // outline color
halo_diameter  = middle_diameter/1.5;            // diameter of brightness ring
halo_width     = 0.8;           // thickness of the ring

// Module: centered LED with a thin circular outline ("brightness" halo)
module led_with_halo(
    size      = led_size,
    led_col   = led_color,
    halo_col  = halo_color,
    halo_d    = halo_diameter,
    halo_w    = halo_width
){
    up(1) {
        // LED body (centered rectangle)
        if (show_leds) color(led_col) rect(size);

        // Thin ring made by subtracting a slightly smaller circle
        halo_path = circle(d=halo_d);
        if (show_halos) color(halo_col) stroke(halo_path,closed=true);
    }
}

// the central hexagon of the snowflake
module central_hexagon(diameter) {
    if(show_board)
        regular_ngon(6, diameter);
//    rot_copies(n=6)
//        right(diameter - branch_thickness/PHI) led_with_halo();
}

module primary_branch(
    length,
){
    if(show_board) {
        rect([length, branch_thickness], anchor=LEFT);
        right(length) xscale(1.5) rect(branch_thickness*1.2, spin=45, rounding=1);
    }
    right(length) led_with_halo();
}

module secondary_branch(
    offset,
    length,
    led=true,
){
    if(show_board)
        for(ang=[60,-60])
            right(offset)
                rect([length, branch_thickness], chamfer=[chamfer,0,0,chamfer],spin=ang, anchor=LEFT);
    if (led)
        for(ang=[60,-60])
            right(offset)
                zrot(ang)
                    right(cos(ang)*length*2 - branch_thickness/PHI)
                        led_with_halo();
}

// When importing the LEDs into KiCAD (for easier alignment), the scale is somehow different from the snowflake.
// Adding these markings in the corners so both exports have the same bounding box.
//for(x=[base_diameter / -2, base_diameter / 2]) {
//    for(y=[base_diameter / -2, base_diameter / 2]) {
//        left(x) back(y) rect(0.2);
//    }
//}
// Rotated so it has vertical primary branches.
// This will make it easier to address the LEDs starting with the "North" branch.
zrot(90) {
    central_hexagon(middle_diameter);
    rot_copies(n=6) {
        primary_branch(radius);
        zrot(30) primary_branch(radius*1.1/2);
        secondary_branch(secondary_branch_1_offset, secondary_branch_1_length);
    }
}
