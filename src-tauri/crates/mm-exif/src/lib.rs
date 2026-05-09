use std::path::Path;
use mm_core::{AppError, ExifData, GpsCoords};
use exif::{In, Tag, Value};
use std::fs::File;
use std::io::BufReader;
use chrono::NaiveDateTime;

pub fn read(path: &Path) -> Result<ExifData, AppError> {
    let ext = path.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase());
    
    match ext.as_deref() {
        Some("jpg") | Some("jpeg") | Some("tif") | Some("tiff") | Some("heic") | Some("heif") | Some("webp") => {
            read_image_exif(path)
        }
        Some("mp4") | Some("mov") | Some("m4v") => {
            read_video_metadata(path)
        }
        _ => Ok(ExifData::default()),
    }
}

fn read_image_exif(path: &Path) -> Result<ExifData, AppError> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let exifreader = exif::Reader::new();
    
    let exif = match exifreader.read_from_container(&mut reader) {
        Ok(e) => e,
        Err(_) => return Ok(ExifData::default()),
    };

    let mut data = ExifData::default();

    if let Some(field) = exif.get_field(Tag::Make, In::PRIMARY) {
        data.camera_make = Some(field.display_value().to_string().trim_matches('"').to_string());
    }
    if let Some(field) = exif.get_field(Tag::Model, In::PRIMARY) {
        data.camera_model = Some(field.display_value().to_string().trim_matches('"').to_string());
    }
    if let Some(field) = exif.get_field(Tag::LensModel, In::PRIMARY) {
        data.lens = Some(field.display_value().to_string().trim_matches('"').to_string());
    }
    if let Some(field) = exif.get_field(Tag::ISOSpeed, In::PRIMARY) {
        if let Value::Short(ref v) = field.value {
            if !v.is_empty() { data.iso = Some(v[0] as u32); }
        }
    }
    if let Some(field) = exif.get_field(Tag::ExposureTime, In::PRIMARY) {
        data.shutter_speed = Some(field.display_value().to_string());
    }
    if let Some(field) = exif.get_field(Tag::FNumber, In::PRIMARY) {
        if let Value::Rational(ref v) = field.value {
            if !v.is_empty() { data.aperture = Some(v[0].to_f32()); }
        }
    }
    if let Some(field) = exif.get_field(Tag::FocalLength, In::PRIMARY) {
        if let Value::Rational(ref v) = field.value {
            if !v.is_empty() { data.focal_length = Some(v[0].to_f32()); }
        }
    }
    if let Some(field) = exif.get_field(Tag::DateTimeOriginal, In::PRIMARY) {
        let dt_str = field.display_value().to_string().trim_matches('"').to_string();
        if let Ok(dt) = NaiveDateTime::parse_from_str(&dt_str, "%Y-%m-%d %H:%M:%S") {
            data.date_taken = Some(dt.and_utc().timestamp_millis());
        }
    }

    let lat = get_gps_coord(&exif, Tag::GPSLatitude, Tag::GPSLatitudeRef);
    let lon = get_gps_coord(&exif, Tag::GPSLongitude, Tag::GPSLongitudeRef);
    if let (Some(lat), Some(lon)) = (lat, lon) {
        data.gps = Some(GpsCoords { lat, lon });
    }

    Ok(data)
}

fn get_gps_coord(exif: &exif::Exif, tag: Tag, ref_tag: Tag) -> Option<f64> {
    let coord = exif.get_field(tag, In::PRIMARY)?;
    let ref_field = exif.get_field(ref_tag, In::PRIMARY)?;
    
    if let Value::Rational(ref v) = coord.value {
        if v.len() >= 3 {
            let deg = v[0].to_f64();
            let min = v[1].to_f64();
            let sec = v[2].to_f64();
            let mut decimal = deg + min / 60.0 + sec / 3600.0;
            
            let ref_str = ref_field.display_value().to_string().trim_matches('"').to_uppercase();
            if ref_str == "S" || ref_str == "W" {
                decimal = -decimal;
            }
            return Some(decimal);
        }
    }
    None
}

fn read_video_metadata(path: &Path) -> Result<ExifData, AppError> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    
    match mp4parse::read_mp4(&mut reader) {
        Ok(_context) => {
            let data = ExifData::default();
            Ok(data)
        }
        Err(_) => Ok(ExifData::default()),
    }
}
