include <BOSL2/std.scad>

PHI = (1 + sqrt(5)) / 2; // =~ 1.618

diameter = 100;
branch_thickness = 12;
secondary_branch_offset = diameter/1.9;
secondary_branch_length = diameter/3.8;
chamfer = branch_thickness / 3;
middle_diameter = diameter*0.4;


regular_ngon(6, middle_diameter);
rot_copies(n=6) {
rect([diameter, branch_thickness], chamfer=chamfer, anchor=LEFT);
for(ang=[60,-60]) right(secondary_branch_offset) rect([secondary_branch_length, branch_thickness], chamfer=chamfer,spin=ang, anchor=LEFT);
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
    color(led_col) rect(size);

    // Thin ring made by subtracting a slightly smaller circle
    halo_path = circle(d=halo_d);
    color(halo_col) stroke(halo_path,closed=true);
}

up(1) {
led_with_halo();
rot_copies(n=6) {
    // vertices of middle hexagon
    right(middle_diameter - branch_thickness/PHI) led_with_halo();
    // main branches
    right(diameter - branch_thickness/PHI) led_with_halo();
    // secondary branches
    for(ang=[60,-60]) right(secondary_branch_offset) zrot(ang) right(cos(ang)*secondary_branch_length*2 - branch_thickness/PHI)led_with_halo();
}
}