from flask import Flask, render_template, request, jsonify, send_from_directory
import json
import os
import uuid
from datetime import datetime
import shutil 
import re # Importado na função load_beat_data

PROJECT_ROOT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..')) 
DATA_JS_PATH = os.path.join(PROJECT_ROOT_PATH, 'js', 'data.js')
STATIC_PATH_PROJECT = os.path.join(PROJECT_ROOT_PATH, 'static')

UPLOAD_FOLDER_BEAT_AUDIO = os.path.join(STATIC_PATH_PROJECT, 'beat')
UPLOAD_FOLDER_COVER = os.path.join(STATIC_PATH_PROJECT, 'cover')
UPLOAD_FOLDER_PACK_AUDIO_BASE = os.path.join(STATIC_PATH_PROJECT, 'pack')


app = Flask(__name__, template_folder='templates', static_folder='static_admin')
app.config['UPLOAD_FOLDER_BEAT_AUDIO'] = UPLOAD_FOLDER_BEAT_AUDIO
app.config['UPLOAD_FOLDER_COVER'] = UPLOAD_FOLDER_COVER
app.config['UPLOAD_FOLDER_PACK_AUDIO_BASE'] = UPLOAD_FOLDER_PACK_AUDIO_BASE
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024 * 1024  # Aumentado para 64MB

os.makedirs(UPLOAD_FOLDER_BEAT_AUDIO, exist_ok=True)
os.makedirs(UPLOAD_FOLDER_COVER, exist_ok=True)
os.makedirs(UPLOAD_FOLDER_PACK_AUDIO_BASE, exist_ok=True)

def load_beat_data():
    try:
        if not os.path.exists(DATA_JS_PATH):
            base_data = {"beats": [], "packs": []}
            save_beat_data(base_data) # Salva um arquivo base se não existir
            return base_data
            
        with open(DATA_JS_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
        
        json_str = content.replace('const beatData =', '', 1).strip()
        if json_str.endswith(';'):
            json_str = json_str[:-1]
        
        json_str = re.sub(r'//.*', '', json_str) 
        json_str = re.sub(r'/\*.*?\*/', '', json_str, flags=re.DOTALL) 
        json_str = re.sub(r'([{,]\s*)([a-zA-Z_]\w*)\s*:', r'\1"\2":', json_str) 
        json_str = re.sub(r',\s*([}\]])', r'\1', json_str) 

        return json.loads(json_str)
    except Exception as e:
        print(f"Erro crítico ao carregar data.js: {e}")
        print("Verifique se o arquivo data.js existe e tem uma estrutura JSON válida após 'const beatData ='.")
        return {"beats": [], "packs": []}


def save_beat_data(data):
    try:
        json_string = json.dumps(data, indent=4, ensure_ascii=False)
        js_content = f"const beatData = {json_string};\n"
        
        add_comment = True
        if os.path.exists(DATA_JS_PATH): # Verifica se o arquivo existe antes de tentar ler
            try:
                with open(DATA_JS_PATH, 'r', encoding='utf-8') as f_check:
                    if "// Nota: Added 'id' to pack tracks" in f_check.read():
                        add_comment = False
            except Exception: # Ignora erro de leitura aqui, pois o arquivo será sobrescrito
                pass 
            
        with open(DATA_JS_PATH, 'w', encoding='utf-8') as f:
            f.write(js_content)
        return True
    except Exception as e:
        print(f"Erro ao salvar data.js: {e}")
        return False

def generate_id(prefix="item_"):
    return f"{prefix}{uuid.uuid4().hex[:8]}"

def get_current_datetime_str():
    return datetime.now().strftime("%d/%m/%Y %H:%M:%S")

def secure_filename_custom(filename):
    if not filename:
        return None
    name, ext = os.path.splitext(filename)
    safe_name = "".join(c if c.isalnum() or c in ['.', '_', '-'] else '_' for c in name.replace(" ", "_")) # Substitui espaço por underscore
    return f"{safe_name}{ext}"

@app.route('/')
def admin_home():
    data = load_beat_data()
    return render_template('admin.html', beats=data.get('beats', []), packs=data.get('packs', []))

@app.route('/get_data', methods=['GET'])
def get_data():
    data = load_beat_data()
    return jsonify(data)

# --- BEATS ---
@app.route('/add_beat', methods=['POST'])
def add_beat_route():
    data = load_beat_data()
    
    new_beat = {
        "id": generate_id("b"),
        "title": request.form.get('title', 'Sem Título'),
        "author": [a.strip() for a in request.form.get('author', '').split(',') if a.strip()],
        "bpm": int(request.form.get('bpm', 0)),
        "key": request.form.get('key', ''),
        "genre": [g.strip() for g in request.form.get('genre', '').split(',') if g.strip()],
        "tags": [t.strip() for t in request.form.get('tags', '').split(',') if t.strip()],
        "price": float(request.form.get('price', 0.0)),
        "discount": int(request.form.get('discount', 0)),
        "exclusive": request.form.get('exclusive') == 'on',
        "dateAdded": get_current_datetime_str(),
        "file": "", 
        "cover": "" 
    }
    if not new_beat["author"]: new_beat["author"] = "Desconhecido"
    elif len(new_beat["author"]) == 1: new_beat["author"] = new_beat["author"][0]

    if 'beatFile' in request.files:
        file = request.files['beatFile']
        if file and file.filename:
            filename = secure_filename_custom(file.filename)
            save_path = os.path.join(app.config['UPLOAD_FOLDER_BEAT_AUDIO'], filename)
            file.save(save_path)
            new_beat['file'] = f"static/beat/{filename}"

    if 'beatCover' in request.files:
        cover_file = request.files['beatCover']
        if cover_file and cover_file.filename:
            cover_filename = secure_filename_custom(cover_file.filename)
            cover_save_path = os.path.join(app.config['UPLOAD_FOLDER_COVER'], cover_filename)
            cover_file.save(cover_save_path)
            new_beat['cover'] = f"static/cover/{cover_filename}"

    data.get('beats', []).append(new_beat)
    if save_beat_data(data):
        return jsonify({"success": True, "message": "Beat adicionado!"})
    return jsonify({"success": False, "message": "Erro ao salvar beat."}), 500


@app.route('/edit_beat/<beat_id>', methods=['POST'])
def edit_beat_route(beat_id):
    data = load_beat_data()
    beat_to_edit = next((b for b in data.get('beats', []) if b['id'] == beat_id), None)
    if not beat_to_edit:
        return jsonify({"success": False, "message": "Beat não encontrado."}), 404

    beat_to_edit["title"] = request.form.get('title', beat_to_edit["title"])
    authors_str = request.form.get('author', None)
    if authors_str is not None: # Só atualiza se o campo foi enviado
        authors = [a.strip() for a in authors_str.split(',') if a.strip()]
        if not authors: beat_to_edit["author"] = "Desconhecido"
        elif len(authors) == 1: beat_to_edit["author"] = authors[0]
        else: beat_to_edit["author"] = authors

    beat_to_edit["bpm"] = int(request.form.get('bpm', beat_to_edit["bpm"]))
    beat_to_edit["key"] = request.form.get('key', beat_to_edit["key"])
    
    genre_str = request.form.get('genre', None)
    if genre_str is not None:
        beat_to_edit["genre"] = [g.strip() for g in genre_str.split(',') if g.strip()]
    
    tags_str = request.form.get('tags', None)
    if tags_str is not None:
        beat_to_edit["tags"] = [t.strip() for t in tags_str.split(',') if t.strip()]

    beat_to_edit["price"] = float(request.form.get('price', beat_to_edit["price"]))
    beat_to_edit["discount"] = int(request.form.get('discount', beat_to_edit["discount"]))
    beat_to_edit["exclusive"] = request.form.get('exclusive') == 'on' # Checkbox envia 'on' ou nada
    beat_to_edit["dateModified"] = get_current_datetime_str()

    if 'beatFile' in request.files:
        file = request.files['beatFile']
        if file and file.filename:
            if beat_to_edit.get('file') and os.path.exists(os.path.join(PROJECT_ROOT_PATH, beat_to_edit['file'])):
                 if beat_to_edit['file'] != f"static/beat/{secure_filename_custom(file.filename)}":
                    try: os.remove(os.path.join(PROJECT_ROOT_PATH, beat_to_edit['file']))
                    except OSError as e: print(f"Aviso: Não foi possível remover arquivo de áudio antigo: {e}")
            filename = secure_filename_custom(file.filename)
            file.save(os.path.join(app.config['UPLOAD_FOLDER_BEAT_AUDIO'], filename))
            beat_to_edit['file'] = f"static/beat/{filename}"

    if 'beatCover' in request.files:
        cover_file = request.files['beatCover']
        if cover_file and cover_file.filename:
            if beat_to_edit.get('cover') and os.path.exists(os.path.join(PROJECT_ROOT_PATH, beat_to_edit['cover'])):
                if beat_to_edit['cover'] != f"static/cover/{secure_filename_custom(cover_file.filename)}":
                    try: os.remove(os.path.join(PROJECT_ROOT_PATH, beat_to_edit['cover']))
                    except OSError as e: print(f"Aviso: Não foi possível remover capa antiga: {e}")
            cover_filename = secure_filename_custom(cover_file.filename)
            cover_file.save(os.path.join(app.config['UPLOAD_FOLDER_COVER'], cover_filename))
            beat_to_edit['cover'] = f"static/cover/{cover_filename}"

    if save_beat_data(data):
        return jsonify({"success": True, "message": "Beat atualizado!"})
    return jsonify({"success": False, "message": "Erro ao atualizar beat."}), 500

@app.route('/delete_beat/<beat_id>', methods=['POST'])
def delete_beat_route(beat_id):
    data = load_beat_data()
    beat_to_delete = next((b for b in data.get('beats', []) if b['id'] == beat_id), None)
    if beat_to_delete:
        if beat_to_delete.get('file') and os.path.exists(os.path.join(PROJECT_ROOT_PATH, beat_to_delete['file'])):
            try: os.remove(os.path.join(PROJECT_ROOT_PATH, beat_to_delete['file']))
            except OSError as e: print(f"Erro ao remover arquivo de áudio do beat: {e}")
        if beat_to_delete.get('cover') and os.path.exists(os.path.join(PROJECT_ROOT_PATH, beat_to_delete['cover'])):
            try: os.remove(os.path.join(PROJECT_ROOT_PATH, beat_to_delete['cover']))
            except OSError as e: print(f"Erro ao remover capa do beat: {e}")
        
        data['beats'] = [b for b in data['beats'] if b['id'] != beat_id]
        if save_beat_data(data):
            return jsonify({"success": True, "message": "Beat removido."})
    return jsonify({"success": False, "message": "Beat não encontrado ou erro ao salvar."}), 404

# --- PACKS ---
@app.route('/add_pack', methods=['POST'])
def add_pack_route():
    data = load_beat_data()
    pack_id = generate_id("pack")
    
    new_pack = {
        "id": pack_id,
        "name": request.form.get('packName', 'Sem Nome'),
        "author": request.form.get('packAuthor', 'Desconhecido'),
        "description": request.form.get('packDescription', ''),
        "price": float(request.form.get('packPrice', 0.0)),
        "discount": int(request.form.get('packDiscount', 0)),
        "cover": "",
        "tracks": []
    }
    pack_bpm_str = request.form.get('packBPM')
    if pack_bpm_str:
        try: new_pack["bpm"] = int(pack_bpm_str)
        except ValueError: pass

    if 'packCover' in request.files:
        cover_file = request.files['packCover']
        if cover_file and cover_file.filename:
            cover_filename = secure_filename_custom(cover_file.filename)
            cover_save_path = os.path.join(app.config['UPLOAD_FOLDER_COVER'], cover_filename)
            cover_file.save(cover_save_path)
            new_pack['cover'] = f"static/cover/{cover_filename}"

    track_titles = request.form.getlist('trackTitle[]')
    track_files = request.files.getlist('trackFile[]') 
    
    pack_audio_folder = os.path.join(app.config['UPLOAD_FOLDER_PACK_AUDIO_BASE'], pack_id)
    os.makedirs(pack_audio_folder, exist_ok=True)

    for i, title in enumerate(track_titles):
        if title: 
            track_entry = {"title": title, "id": generate_id(f"trk_{pack_id}_")}
            if i < len(track_files) and track_files[i] and track_files[i].filename:
                track_file_obj = track_files[i]
                track_filename = secure_filename_custom(track_file_obj.filename)
                track_save_path = os.path.join(pack_audio_folder, track_filename)
                track_file_obj.save(track_save_path)
                track_entry['file'] = f"static/pack/{pack_id}/{track_filename}"
            new_pack['tracks'].append(track_entry)

    data.get('packs', []).append(new_pack)
    if save_beat_data(data):
        return jsonify({"success": True, "message": "Pacote adicionado!"})
    return jsonify({"success": False, "message": "Erro ao salvar pacote."}), 500

@app.route('/edit_pack/<pack_id>', methods=['POST'])
def edit_pack_route(pack_id):
    data = load_beat_data()
    pack_to_edit = next((p for p in data.get('packs', []) if p['id'] == pack_id), None)
    if not pack_to_edit:
        return jsonify({"success": False, "message": "Pacote não encontrado."}), 404

    pack_to_edit["name"] = request.form.get('packName', pack_to_edit["name"])
    pack_to_edit["author"] = request.form.get('packAuthor', pack_to_edit["author"])
    pack_to_edit["description"] = request.form.get('packDescription', pack_to_edit["description"])
    pack_to_edit["price"] = float(request.form.get('packPrice', pack_to_edit["price"]))
    pack_to_edit["discount"] = int(request.form.get('packDiscount', pack_to_edit["discount"]))
    
    pack_bpm_str = request.form.get('packBPM')
    if pack_bpm_str:
        try: pack_to_edit["bpm"] = int(pack_bpm_str)
        except ValueError: pass
    elif 'bpm' in pack_to_edit and not pack_bpm_str:
        del pack_to_edit['bpm']

    if 'packCover' in request.files:
        cover_file = request.files['packCover']
        if cover_file and cover_file.filename:
            if pack_to_edit.get('cover') and os.path.exists(os.path.join(PROJECT_ROOT_PATH, pack_to_edit['cover'])):
                if pack_to_edit['cover'] != f"static/cover/{secure_filename_custom(cover_file.filename)}":
                    try: os.remove(os.path.join(PROJECT_ROOT_PATH, pack_to_edit['cover']))
                    except OSError as e: print(f"Aviso: Não foi possível remover capa antiga do pacote: {e}")
            cover_filename = secure_filename_custom(cover_file.filename)
            cover_file.save(os.path.join(app.config['UPLOAD_FOLDER_COVER'], cover_filename))
            pack_to_edit['cover'] = f"static/cover/{cover_filename}"
    
    new_track_titles = request.form.getlist('trackTitle[]')
    new_track_files = request.files.getlist('trackFile[]')
    original_track_files = request.form.getlist('originalTrackFile[]') # Campo oculto com o caminho do arquivo original
    original_track_ids = request.form.getlist('originalTrackId[]') # Campo oculto com o ID original da faixa


    updated_tracks = []
    pack_audio_folder = os.path.join(app.config['UPLOAD_FOLDER_PACK_AUDIO_BASE'], pack_id)
    os.makedirs(pack_audio_folder, exist_ok=True)

    for i, title in enumerate(new_track_titles):
        if title:
            track_entry = {"title": title}
            # Se um ID original foi enviado, usa-o, senão gera um novo
            track_entry["id"] = original_track_ids[i] if i < len(original_track_ids) and original_track_ids[i] else generate_id(f"trk_{pack_id}_")

            if i < len(new_track_files) and new_track_files[i] and new_track_files[i].filename:
                track_file_obj = new_track_files[i]
                track_filename = secure_filename_custom(track_file_obj.filename)
                track_save_path = os.path.join(pack_audio_folder, track_filename)
                track_file_obj.save(track_save_path)
                track_entry['file'] = f"static/pack/{pack_id}/{track_filename}"
                # Se um novo arquivo foi carregado, remove o antigo se existir e for diferente
                if i < len(original_track_files) and original_track_files[i] and \
                   os.path.exists(os.path.join(PROJECT_ROOT_PATH, original_track_files[i])) and \
                   original_track_files[i] != track_entry['file']:
                    try:
                        os.remove(os.path.join(PROJECT_ROOT_PATH, original_track_files[i]))
                        print(f"Arquivo de faixa antigo removido: {original_track_files[i]}")
                    except OSError as e:
                        print(f"Aviso: Não foi possível remover arquivo de faixa antigo: {e}")
            elif i < len(original_track_files) and original_track_files[i]: # Mantém o arquivo original se nenhum novo foi enviado
                track_entry['file'] = original_track_files[i]
            
            updated_tracks.append(track_entry)
    
    # Antes de atribuir as novas faixas, verifica se alguma faixa antiga foi completamente removida
    # (não está presente em updated_tracks por ID) e remove seus arquivos.
    # Esta lógica é mais complexa e pode ser adicionada depois se necessário.
    # Por enquanto, focamos em atualizar/adicionar.
    pack_to_edit['tracks'] = updated_tracks


    if save_beat_data(data):
        return jsonify({"success": True, "message": "Pacote atualizado!"})
    return jsonify({"success": False, "message": "Erro ao atualizar pacote."}), 500

@app.route('/delete_pack/<pack_id>', methods=['POST'])
def delete_pack_route(pack_id):
    data = load_beat_data()
    pack_to_delete = next((p for p in data.get('packs', []) if p['id'] == pack_id), None)
    if pack_to_delete:
        if pack_to_delete.get('cover') and os.path.exists(os.path.join(PROJECT_ROOT_PATH, pack_to_delete['cover'])):
            try: os.remove(os.path.join(PROJECT_ROOT_PATH, pack_to_delete['cover']))
            except OSError as e: print(f"Erro ao remover capa do pacote: {e}")

        pack_audio_folder_abs = os.path.join(UPLOAD_FOLDER_PACK_AUDIO_BASE, pack_id)
        if os.path.exists(pack_audio_folder_abs):
            try:
                shutil.rmtree(pack_audio_folder_abs)
                print(f"Pasta do pacote {pack_audio_folder_abs} removida.")
            except OSError as e:
                print(f"Erro ao remover pasta de áudio do pacote {pack_audio_folder_abs}: {e}")

        data['packs'] = [p for p in data['packs'] if p['id'] != pack_id]
        if save_beat_data(data):
            return jsonify({"success": True, "message": "Pacote removido."})
    return jsonify({"success": False, "message": "Pacote não encontrado ou erro ao salvar."}), 404


if __name__ == '__main__':
    print(f"Servindo painel admin em http://127.0.0.1:5001")
    print(f"Arquivo de dados principal: {DATA_JS_PATH}")
    print(f"Pasta static do projeto principal: {STATIC_PATH_PROJECT}")
    app.run(debug=True, port=5001)