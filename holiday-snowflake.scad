include <BOSL2/std.scad>

//visualization options
show_leds = true;
show_halos = false;
show_board = true;

$fn=16;

PHI = (1 + sqrt(5)) / 2; // =~ 1.618

diameter = 200;
radius = diameter / 2;
branch_thickness = 12;
secondary_branch_offset = radius*0.525;
secondary_branch_length = radius/3;

tertiary_branch_offset = radius*0.7625;
tertiary_branch_length = secondary_branch_length*2/3;

chamfer = branch_thickness / 3;
middle_diameter = radius*0.4;


module secondary_branch(
    offset,
    length,
){
    for(ang=[60,-60])
        right(offset)
            rect([length, branch_thickness], chamfer=chamfer,spin=ang, anchor=LEFT);
}

regular_ngon(6, middle_diameter);
rot_copies(n=6) {
rect([radius, branch_thickness], anchor=LEFT);
right(radius) xscale(1.5) rect(branch_thickness*1.2, spin=45, rounding=1);
secondary_branch(secondary_branch_offset, secondary_branch_length);
secondary_branch(tertiary_branch_offset, tertiary_branch_length);
}


// --- LED + halo params ---
led_size       = [5,5];
led_color      = "lightblue";
halo_color     = "lightyellow";   // outline color
halo_diameter  = middle_diameter;            // diameter of brightness ring
halo_width     = 0.8;           // thickness of the ring

// Module: centered LED with a thin circular outline ("brightness" halo)
module led_with_halo(
    size      = led_size,
    led_col   = led_color,
    halo_col  = halo_color,
    halo_d    = halo_diameter,
    halo_w    = halo_width
){
    // LED body (centered rectangle)
    if (show_leds) color(led_col) rect(size);

    // Thin ring made by subtracting a slightly smaller circle
    halo_path = circle(d=halo_d);
    if (show_halos) color(halo_col) stroke(halo_path,closed=true);
}

up(1) {
rot_copies(n=6) {
    // vertices of middle hexagon
    right(middle_diameter - branch_thickness/PHI) led_with_halo();
    // main branches
    right(radius) led_with_halo();
    // secondary branches
    for(ang=[60,-60]) right(secondary_branch_offset) zrot(ang) right(cos(ang)*secondary_branch_length*2 - branch_thickness/PHI)led_with_halo();
}
}
